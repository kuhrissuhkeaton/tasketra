import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

const VALID_LEVELS = ["low", "medium", "high"];
const VALID_STATUSES = ["open", "monitoring", "resolved"];
const RISK_FIELDS = [
  { key: "title", label: "title" },
  { key: "description", label: "description" },
  { key: "probability", label: "probability" },
  { key: "impact", label: "impact" },
  { key: "probability_score", label: "probability score" },
  { key: "impact_score", label: "impact score" },
  { key: "mitigation", label: "mitigation" },
  { key: "owner_name", label: "owner" },
  { key: "status", label: "status" },
];

// v157: numeric scores (1-5), the scales real plans rank risks by. The band
// a score lands in -- kept in step with bandForScore in
// src/lib/riskExposure.ts (the server cannot import the client lib). Every
// save that carries scores also stores the derived bands, so surfaces that
// read only the bands (the risk matrix, print, exports) stay correct.
function bandForScore(score: number): string {
  return score <= 2 ? "low" : score === 3 ? "medium" : "high";
}

function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Reads the score pair off a request body. The pair is set together or not
 * at all:
 *   - neither key present -> { present: false } (not this request's concern)
 *   - both null           -> { present: true, scores: null } (clear them)
 *   - both integers 1-5   -> { present: true, scores: [p, i] }
 *   - anything else       -> { error }
 */
function parseScores(body: any):
  | { present: false }
  | { present: true; scores: [number, number] | null }
  | { error: string } {
  const hasP = body?.probabilityScore !== undefined;
  const hasI = body?.impactScore !== undefined;
  if (!hasP && !hasI) return { present: false };
  const p = body.probabilityScore;
  const i = body.impactScore;
  if (p === null && i === null) return { present: true, scores: null };
  if (!isValidScore(p) || !isValidScore(i)) {
    return { error: "Probability and impact scores must be whole numbers from 1 to 5, and set together." };
  }
  return { present: true, scores: [p, i] };
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const risks = await database.sql`
      SELECT id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status, created_at, updated_at, resolved_at
      FROM risks WHERE project_id = ${projectId} AND deleted_at IS NULL
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END,
        CASE WHEN (probability = 'high' AND impact = 'high')
               OR (probability_score IS NOT NULL AND impact_score IS NOT NULL
                   AND (probability_score * impact_score >= 12 OR impact_score = 5)) THEN 0
             WHEN probability = 'high' OR impact = 'high' THEN 1
             WHEN probability = 'medium' AND impact = 'medium' THEN 2
             ELSE 3 END,
        created_at DESC
    `;
    return json({ risks });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const title = (body?.title || "").trim();
    if (!projectId || !title) return json({ error: "projectId and title are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const parsedScores = parseScores(body);
    if ("error" in parsedScores) return json({ error: parsedScores.error }, { status: 400 });
    const scores = parsedScores.present ? parsedScores.scores : null;
    // Scores, when set, own the bands: derive them so band-reading surfaces
    // stay correct. Without scores the bands are whatever the caller sent
    // (defaulting to medium, as before).
    const probability = scores ? bandForScore(scores[0]) : (VALID_LEVELS.includes(body?.probability) ? body.probability : "medium");
    const impact = scores ? bandForScore(scores[1]) : (VALID_LEVELS.includes(body?.impact) ? body.impact : "medium");
    if (body?.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    const status = VALID_STATUSES.includes(body?.status) ? body.status : "open";
    const resolvedAt = status === "resolved" ? new Date() : null;

    const [risk] = await database.sql`
      INSERT INTO risks (project_id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status, resolved_at)
      VALUES (${projectId}, ${title}, ${body?.description || null}, ${probability}, ${impact}, ${scores ? scores[0] : null}, ${scores ? scores[1] : null}, ${body?.mitigation || null}, ${body?.ownerName || null}, ${status}, ${resolvedAt})
      RETURNING id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status, created_at, updated_at, resolved_at
    `;
    await logActivity(database, { projectId, entityType: "risk", entityId: risk.id, entityTitle: risk.title, action: "created" });
    return json({ risk }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM risks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE risks SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: existing.title, action: "restored" });
      return json({ ok: true });
    }

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return json({ error: "Invalid status." }, { status: 400 });
    }
    if (body.probability && !VALID_LEVELS.includes(body.probability)) {
      return json({ error: "Invalid probability." }, { status: 400 });
    }
    if (body.impact && !VALID_LEVELS.includes(body.impact)) {
      return json({ error: "Invalid impact." }, { status: 400 });
    }

    // v157 scores: keyed like the stakeholder contact fields -- the keys'
    // presence in the body is the signal. Present-and-numeric sets the
    // scores AND the bands derived from them (scores win over any band in
    // the same request); present-and-null clears the scores and leaves the
    // bands to the body's band fields, if any; absent leaves both alone, so
    // a status-only patch never disturbs them.
    const parsedScores = parseScores(body);
    if ("error" in parsedScores) return json({ error: parsedScores.error }, { status: 400 });
    const hasScores = parsedScores.present;
    const nextProbabilityScore: number | null = hasScores && parsedScores.scores ? parsedScores.scores[0] : null;
    const nextImpactScore: number | null = hasScores && parsedScores.scores ? parsedScores.scores[1] : null;
    const effProbability = hasScores && parsedScores.scores ? bandForScore(parsedScores.scores[0]) : (body.probability ?? null);
    const effImpact = hasScores && parsedScores.scores ? bandForScore(parsedScores.scores[1]) : (body.impact ?? null);

    const [risk] = await database.sql`
      UPDATE risks SET
        title = COALESCE(${body.title ?? null}, title),
        description = COALESCE(${body.description ?? null}, description),
        probability = COALESCE(${effProbability}, probability),
        impact = COALESCE(${effImpact}, impact),
        probability_score = CASE WHEN ${hasScores} THEN ${nextProbabilityScore} ELSE probability_score END,
        impact_score = CASE WHEN ${hasScores} THEN ${nextImpactScore} ELSE impact_score END,
        mitigation = COALESCE(${body.mitigation ?? null}, mitigation),
        owner_name = COALESCE(${body.ownerName ?? null}, owner_name),
        status = COALESCE(${body.status ?? null}, status),
        resolved_at = CASE WHEN ${body.status ?? null} = 'resolved' THEN now() ELSE resolved_at END,
        updated_at = now()
      WHERE id = ${id}
      RETURNING id, title, description, probability, impact, probability_score, impact_score, mitigation, owner_name, status, created_at, updated_at, resolved_at
    `;

    const summary = diffSummary(existing, {
      title: body.title, description: body.description, probability: effProbability ?? undefined,
      impact: effImpact ?? undefined,
      probability_score: hasScores ? nextProbabilityScore : undefined,
      impact_score: hasScores ? nextImpactScore : undefined,
      mitigation: body.mitigation, owner_name: body.ownerName, status: body.status,
    }, RISK_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: risk.title, action: "updated", summary });

    return json({ risk });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, title FROM risks WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE risks SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "risk", entityId: id, entityTitle: existing.title, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/risks" };
