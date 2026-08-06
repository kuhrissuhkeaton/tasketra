import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess, isProjectOwner } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { sendEmail } from "../lib/notify.ts";
import { getSiteUrl } from "../lib/env.ts";
import { MEMBER_LIMIT_PER_PROJECT } from "../lib/billing.ts";

export default async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [owner] = await database.sql`
      SELECT u.id, u.email FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ${projectId}
    `;
    const members = await database.sql`
      SELECT pm.id, pm.invited_email AS email, pm.status, pm.invited_at, pm.joined_at, pm.is_ccb_reviewer
      FROM project_members pm
      WHERE pm.project_id = ${projectId}
      ORDER BY pm.invited_at ASC
    `;
    return json({ owner, members });
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    const projectId = body?.projectId;
    if (!id || !projectId) return json({ error: "id and projectId required" }, { status: 400 });
    if (typeof body?.isCcbReviewer !== "boolean") return json({ error: "isCcbReviewer (boolean) is required" }, { status: 400 });
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not authorized" }, { status: 403 });

    const [member] = await database.sql`
      UPDATE project_members SET is_ccb_reviewer = ${body.isCcbReviewer}
      WHERE id = ${id} AND project_id = ${projectId}
      RETURNING id, invited_email AS email, status, invited_at, joined_at, is_ccb_reviewer
    `;
    if (!member) return json({ error: "Not found" }, { status: 404 });

    await logActivity(database, {
      projectId, entityType: "member", entityId: id, entityTitle: member.email, action: "updated",
      summary: body.isCcbReviewer ? `${member.email} added as a CCB reviewer` : `${member.email} removed as a CCB reviewer`,
    });
    return json({ member });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const projectId = body?.projectId;
    const email = (body?.email || "").trim().toLowerCase();
    if (!projectId || !email) return json({ error: "projectId and email are required." }, { status: 400 });
    if (!(await isProjectOwner(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const [project] = await database.sql`SELECT name, owner_id FROM projects WHERE id = ${projectId}`;
    if (project?.owner_id) {
      const [ownerRow] = await database.sql`SELECT email FROM users WHERE id = ${project.owner_id}`;
      if (ownerRow?.email === email) {
        return json({ error: "That's already the project owner." }, { status: 400 });
      }
    }

    // Self-serve ceiling on team size per project, regardless of plan --
    // protects against the "one flat-rate account, hundreds of active
    // members" cost scenario. Doesn't count against an email already on the
    // project (re-inviting/updating an existing row shouldn't be blocked).
    const [{ count: memberCount }] = await database.sql`
      SELECT count(*)::int AS count FROM project_members WHERE project_id = ${projectId} AND invited_email != ${email}
    `;
    if (memberCount >= MEMBER_LIMIT_PER_PROJECT) {
      return json(
        { error: `This project is at the ${MEMBER_LIMIT_PER_PROJECT}-member limit. Contact us for larger teams.` },
        { status: 402 }
      );
    }

    const [existingUser] = await database.sql`SELECT id FROM users WHERE email = ${email}`;

    const member = existingUser
      ? (await database.sql`
          INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at)
          VALUES (${projectId}, ${existingUser.id}, ${email}, 'active', now())
          ON CONFLICT (project_id, invited_email) DO UPDATE SET
            user_id = EXCLUDED.user_id, status = 'active', joined_at = now()
          RETURNING id, invited_email AS email, status, invited_at, joined_at
        `)[0]
      : (await database.sql`
          INSERT INTO project_members (project_id, user_id, invited_email, status)
          VALUES (${projectId}, NULL, ${email}, 'invited')
          ON CONFLICT (project_id, invited_email) DO UPDATE SET
            status = CASE WHEN project_members.status = 'active' THEN project_members.status ELSE EXCLUDED.status END
          RETURNING id, invited_email AS email, status, invited_at, joined_at
        `)[0];

    await logActivity(database, {
      projectId, entityType: "member", entityId: member.id, entityTitle: email, action: "created",
      summary: existingUser ? `${email} added to the project` : `${email} invited to the project`,
    });

    if (!existingUser) {
      await sendEmail(
        email,
        `You've been invited to a Tasketra project${project?.name ? `: ${project.name}` : ""}`,
        `You've been invited to collaborate on "${project?.name || "a project"}" in Tasketra. Create an account with this email address (${email}) to get access: ${getSiteUrl()}/login`
      );
    }

    return json({ member }, { status: 201 });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const projectId = url.searchParams.get("projectId");
    if (!id || !projectId) return json({ error: "id and projectId required" }, { status: 400 });

    const [member] = await database.sql`SELECT * FROM project_members WHERE id = ${id} AND project_id = ${projectId}`;
    if (!member) return json({ error: "Not found" }, { status: 404 });

    const isOwner = await isProjectOwner(userId, projectId);
    const isSelf = member.user_id === userId;
    if (!isOwner && !isSelf) return json({ error: "Not authorized" }, { status: 403 });

    await database.sql`DELETE FROM project_members WHERE id = ${id}`;
    await logActivity(database, {
      projectId, entityType: "member", entityId: id, entityTitle: member.invited_email, action: "deleted",
      summary: isSelf ? `${member.invited_email} left the project` : `${member.invited_email} removed from the project`,
    });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};

export const config: Config = { path: "/api/members" };
