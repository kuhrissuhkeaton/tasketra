import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { loadRaci, isRaciRole } from "../lib/raciData.ts";

// GET ?projectId=            -> { rows, people, assignments }
// PUT {projectId, itemId, personKey, role|null} -> sets or clears one cell.
//   itemId is a phase, a milestone or a task that has been added as a row.
// POST {projectId, taskId} -> adds a task as a row (the task itself is never changed).
// DELETE ?projectId=&taskId= -> removes a task row and the letters set on it.
// Anyone with project access can edit (like the roadmap itself). The
// "one Accountable per row" rule is a warning in the app, never enforced here.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const projectId = new URL(req.url).searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    return json(await loadRaci(database, projectId));
  }

  if (req.method === "PUT") {
    const body = (await req.json().catch(() => null)) as any;
    const { projectId, itemId, personKey } = body ?? {};
    if (!projectId || !itemId || typeof personKey !== "string") {
      return json({ error: "projectId, itemId and personKey are required." }, { status: 400 });
    }
    const role = body.role ?? null;
    if (role !== null && !isRaciRole(role)) return json({ error: "Invalid role." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    // The row and the person must both belong to this project (and be live).
    const { rows, people } = await loadRaci(database, projectId);
    const row = rows.find((r) => r.id === itemId);
    if (!row) return json({ error: "That row is not in this project." }, { status: 400 });
    const isTask = row.type === "task";
    if (!people.some((p) => p.key === personKey)) return json({ error: "That person is not on this project." }, { status: 400 });

    const isStakeholder = personKey.startsWith("s:");
    const personId = personKey.slice(2);
    const stakeholderId = isStakeholder ? personId : null;
    const memberId = isStakeholder ? null : personId;

    if (isTask) {
      if (role === null) {
        if (isStakeholder) {
          await database.sql`DELETE FROM raci_assignments WHERE task_id = ${itemId} AND stakeholder_id = ${stakeholderId}`;
        } else {
          await database.sql`DELETE FROM raci_assignments WHERE task_id = ${itemId} AND user_id = ${memberId}`;
        }
      } else if (isStakeholder) {
        await database.sql`
          INSERT INTO raci_assignments (project_id, task_id, stakeholder_id, role, updated_by)
          VALUES (${projectId}, ${itemId}, ${stakeholderId}, ${role}, ${userId})
          ON CONFLICT (task_id, stakeholder_id) WHERE task_id IS NOT NULL AND stakeholder_id IS NOT NULL
          DO UPDATE SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()
        `;
      } else {
        await database.sql`
          INSERT INTO raci_assignments (project_id, task_id, user_id, role, updated_by)
          VALUES (${projectId}, ${itemId}, ${memberId}, ${role}, ${userId})
          ON CONFLICT (task_id, user_id) WHERE task_id IS NOT NULL AND user_id IS NOT NULL
          DO UPDATE SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()
        `;
      }
      return json({ ok: true });
    }

    if (role === null) {
      if (isStakeholder) {
        await database.sql`DELETE FROM raci_assignments WHERE roadmap_item_id = ${itemId} AND stakeholder_id = ${stakeholderId}`;
      } else {
        await database.sql`DELETE FROM raci_assignments WHERE roadmap_item_id = ${itemId} AND user_id = ${memberId}`;
      }
    } else if (isStakeholder) {
      await database.sql`
        INSERT INTO raci_assignments (project_id, roadmap_item_id, stakeholder_id, role, updated_by)
        VALUES (${projectId}, ${itemId}, ${stakeholderId}, ${role}, ${userId})
        ON CONFLICT (roadmap_item_id, stakeholder_id) WHERE stakeholder_id IS NOT NULL
        DO UPDATE SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()
      `;
    } else {
      await database.sql`
        INSERT INTO raci_assignments (project_id, roadmap_item_id, user_id, role, updated_by)
        VALUES (${projectId}, ${itemId}, ${memberId}, ${role}, ${userId})
        ON CONFLICT (roadmap_item_id, user_id) WHERE user_id IS NOT NULL
        DO UPDATE SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by, updated_at = now()
      `;
    }
    return json({ ok: true });
  }

  if (req.method === "POST") {
    const body = (await req.json().catch(() => null)) as any;
    const { projectId, taskId } = body ?? {};
    if (!projectId || !taskId) return json({ error: "projectId and taskId are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    const [task] = await database.sql`SELECT id FROM tasks WHERE id = ${taskId} AND project_id = ${projectId} AND deleted_at IS NULL`;
    if (!task) return json({ error: "That task is not in this project." }, { status: 400 });
    await database.sql`
      INSERT INTO raci_task_rows (task_id, project_id, added_by) VALUES (${taskId}, ${projectId}, ${userId})
      ON CONFLICT (task_id) DO NOTHING
    `;
    return json({ ok: true }, { status: 201 });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const taskId = url.searchParams.get("taskId");
    if (!projectId || !taskId) return json({ error: "projectId and taskId are required." }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });
    await database.sql`DELETE FROM raci_assignments WHERE task_id = ${taskId} AND project_id = ${projectId}`;
    await database.sql`DELETE FROM raci_task_rows WHERE task_id = ${taskId} AND project_id = ${projectId}`;
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/raci" };
