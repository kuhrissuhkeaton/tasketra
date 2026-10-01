import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity, diffSummary } from "../lib/activity.ts";
import { withSentry } from "../lib/sentry.ts";

const STAKEHOLDER_FIELDS = [
  { key: "name", label: "name" },
  { key: "role", label: "role" },
  { key: "email", label: "email" },
  { key: "phone", label: "phone" },
  { key: "power_level", label: "power" },
  { key: "interest_level", label: "interest level" },
  { key: "preferred_contact", label: "preferred contact" },
];

// Small fixed lists, mirrored by CHECK constraints in the migration.
const VALID_INTEREST = ["low", "medium", "high"];
const VALID_CONTACT = ["email", "phone", "text", "chat", "in_person"];
const MAX_PHONE = 40;
const MAX_NOTES = 5000;

// Optional contact fields shared by create and update. A blank value means
// "none" (stored as null); anything else must pass validation. Returns an
// error message, or null when everything is fine.
function validateContactFields(body: any): string | null {
  const interest = body?.interestLevel;
  if (interest && !VALID_INTEREST.includes(interest)) return "Invalid interest level.";
  const power = body?.powerLevel;
  if (power && !VALID_INTEREST.includes(power)) return "Invalid power level.";
  const contact = body?.preferredContact;
  if (contact && !VALID_CONTACT.includes(contact)) return "Invalid preferred contact method.";
  if (typeof body?.phone === "string" && body.phone.trim().length > MAX_PHONE) return "Phone number is too long.";
  if (typeof body?.notes === "string" && body.notes.length > MAX_NOTES) return "Notes are too long.";
  return null;
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

    const stakeholders = await database.sql`
      SELECT s.id, s.name, s.email, s.role, s.phone, s.power_level, s.interest_level, s.preferred_contact, s.notes,
        (SELECT count(*)::int
           FROM decision_request_recipients r
           JOIN decision_requests dr ON dr.id = r.decision_request_id
           WHERE r.stakeholder_id = s.id AND dr.deleted_at IS NULL) AS decisions_sent,
        (SELECT count(*)::int
           FROM decision_request_recipients r
           JOIN decision_requests dr ON dr.id = r.decision_request_id
           WHERE r.stakeholder_id = s.id AND dr.status = 'resolved' AND dr.deleted_at IS NULL) AS decisions_resolved
      FROM stakeholders s
      WHERE s.project_id = ${projectId} AND s.deleted_at IS NULL
      ORDER BY s.created_at ASC
    `;
    return json({ stakeholders });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const name = (body?.name || "").trim();
    if (!projectId || !name) return json({ error: "projectId and name are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const contactError = validateContactFields(body);
    if (contactError) return json({ error: contactError }, { status: 400 });

    const [stakeholder] = await database.sql`
      INSERT INTO stakeholders (project_id, name, email, role, phone, power_level, interest_level, preferred_contact, notes)
      VALUES (
        ${projectId}, ${name}, ${body?.email || null}, ${body?.role || null},
        ${body?.phone?.trim() || null}, ${body?.powerLevel || null}, ${body?.interestLevel || null}, ${body?.preferredContact || null}, ${body?.notes || null}
      )
      RETURNING id, name, email, role, phone, power_level, interest_level, preferred_contact, notes
    `;
    await logActivity(database, { projectId, entityType: "stakeholder", entityId: stakeholder.id, entityTitle: stakeholder.name, action: "created" });
    return json({ stakeholder }, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT * FROM stakeholders WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE stakeholders SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: existing.name, action: "restored" });
      return json({ ok: true });
    }

    const contactError = validateContactFields(body);
    if (contactError) return json({ error: contactError }, { status: 400 });

    // The newer contact fields are set-or-clear: a value sets it, an
    // empty value clears it, and leaving the key out changes nothing (the
    // COALESCE pattern used for name/role/email can't express "clear").
    const hasPhone = "phone" in body;
    const hasPower = "powerLevel" in body;
    const hasInterest = "interestLevel" in body;
    const hasContact = "preferredContact" in body;
    const hasNotes = "notes" in body;
    const nextPhone: string | null = hasPhone ? (body.phone?.trim() || null) : null;
    const nextPower: string | null = hasPower ? (body.powerLevel || null) : null;
    const nextInterest: string | null = hasInterest ? (body.interestLevel || null) : null;
    const nextContact: string | null = hasContact ? (body.preferredContact || null) : null;
    const nextNotes: string | null = hasNotes ? (body.notes || null) : null;

    const [stakeholder] = await database.sql`
      UPDATE stakeholders SET
        name = COALESCE(${body.name ?? null}, name),
        role = COALESCE(${body.role ?? null}, role),
        email = COALESCE(${body.email ?? null}, email),
        phone = CASE WHEN ${hasPhone} THEN ${nextPhone} ELSE phone END,
        power_level = CASE WHEN ${hasPower} THEN ${nextPower} ELSE power_level END,
        interest_level = CASE WHEN ${hasInterest} THEN ${nextInterest} ELSE interest_level END,
        preferred_contact = CASE WHEN ${hasContact} THEN ${nextContact} ELSE preferred_contact END,
        notes = CASE WHEN ${hasNotes} THEN ${nextNotes} ELSE notes END
      WHERE id = ${id}
      RETURNING id, name, email, role, phone, power_level, interest_level, preferred_contact, notes
    `;

    const summary = diffSummary(existing, {
      name: body.name, role: body.role, email: body.email,
      phone: hasPhone ? nextPhone : undefined,
      power_level: hasPower ? nextPower : undefined,
      interest_level: hasInterest ? nextInterest : undefined,
      preferred_contact: hasContact ? nextContact : undefined,
    }, STAKEHOLDER_FIELDS);
    await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: stakeholder.name, action: "updated", summary });

    return json({ stakeholder });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, name FROM stakeholders WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE stakeholders SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, { projectId: existing.project_id, entityType: "stakeholder", entityId: id, entityTitle: existing.name, action: "deleted" });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/stakeholders" };
