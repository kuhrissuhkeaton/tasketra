import { db } from "./db.ts";

/**
 * Returns true if the given user can read/write this project -- either as the
 * original owner, or as an active invited member. This is the check used by
 * every entity endpoint (tasks, issues, risks, stakeholders, decisions, etc.).
 */
export async function hasProjectAccess(userId: string, projectId: string): Promise<boolean> {
  const database = db();
  const rows = await database.sql`
    SELECT 1 FROM projects WHERE id = ${projectId} AND owner_id = ${userId}
    UNION
    SELECT 1 FROM project_members WHERE project_id = ${projectId} AND user_id = ${userId} AND status = 'active'
  `;
  return rows.length > 0;
}

/**
 * Returns true only if the given user is the project's original owner.
 * Used to gate owner-only actions: inviting members and removing other members.
 */
export async function isProjectOwner(userId: string, projectId: string): Promise<boolean> {
  const database = db();
  const rows = await database.sql`SELECT 1 FROM projects WHERE id = ${projectId} AND owner_id = ${userId}`;
  return rows.length > 0;
}
