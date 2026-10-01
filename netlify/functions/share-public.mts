import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { loadRaci } from "../lib/raciData.ts";
import { checkRateLimit, getClientIp } from "../lib/rate-limit.ts";

// Public, unauthenticated, read-only. Resolves an unguessable token to ONE
// document for ONE project and only while the link is active and the project
// is not deleted. Risks are limited to the fields printed on the page: no
// descriptions, ids, emails or resolved items.

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export default withSentry(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405, headers: HEADERS });
  const database = db();
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json({ error: "token required" }, { status: 400, headers: HEADERS });

  if (!(await checkRateLimit(database, `share-public:${getClientIp(req)}`, 60, 10))) {
    return json({ error: "Too many requests. Try again in a few minutes." }, { status: 429, headers: HEADERS });
  }

  const [link] = await database.sql`
    SELECT s.kind, p.id AS project_id, p.name
    FROM share_links s JOIN projects p ON p.id = s.project_id
    WHERE s.token = ${token} AND s.revoked_at IS NULL AND p.deleted_at IS NULL
  `;
  const gone = { error: "This link is not valid or is no longer shared." };
  if (!link) return json(gone, { status: 404, headers: HEADERS });

  if (link.kind === "risk-matrix") {
    const risks = await database.sql`
      SELECT title, probability, impact, mitigation, owner_name, status
      FROM risks
      WHERE project_id = ${link.project_id} AND deleted_at IS NULL AND status IN ('open', 'monitoring')
      ORDER BY
        CASE WHEN probability = 'high' AND impact = 'high' THEN 0
             WHEN probability = 'high' OR impact = 'high' THEN 1
             WHEN probability = 'medium' AND impact = 'medium' THEN 2
             ELSE 3 END,
        created_at DESC
    `;
    return json({ kind: link.kind, project: { name: link.name }, risks }, { headers: HEADERS });
  }
  if (link.kind === "raci") {
    // Phases and milestones, people (display name or the part of the email
    // before the @, plus job role) and the letters. Ids are replaced with
    // positions so no internal ids, emails or stakeholder notes leave the app.
    const { rows, people, assignments } = await loadRaci(database, link.project_id);
    const rowIdx = new Map(rows.map((r, i) => [r.id, `r${i}`]));
    const personIdx = new Map(people.map((p, i) => [p.key, `p${i}`]));
    return json(
      {
        kind: link.kind,
        project: { name: link.name },
        rows: rows.map((r) => ({ id: rowIdx.get(r.id)!, type: r.type, title: r.title, start_date: r.start_date, end_date: r.end_date })),
        people: people.map((p) => ({ key: personIdx.get(p.key)!, name: p.name, role: p.role })),
        assignments: assignments.map((a) => ({ itemId: rowIdx.get(a.itemId)!, personKey: personIdx.get(a.personKey)!, role: a.role })),
      },
      { headers: HEADERS }
    );
  }
  return json(gone, { status: 404, headers: HEADERS });
});

export const config: Config = { path: "/api/share-public" };
