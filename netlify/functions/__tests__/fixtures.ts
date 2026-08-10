import { createSessionCookie, hashPassword } from "../../lib/auth.ts";
import { db } from "../../lib/db.ts";

/** Inserts a user directly (bypassing the register handler/rate limiter,
 *  since most tests only care about what happens once a user exists) and
 *  returns their id plus a ready-to-use Request builder authenticated as them. */
export async function createTestUser(
  email: string,
  opts: { foundingMember?: boolean } = {}
): Promise<{ id: string; email: string; cookie: string }> {
  const database = db();
  const passwordHash = await hashPassword("irrelevant-for-these-tests-123");
  const [user] = await database.sql<{ id: string }>`
    INSERT INTO users (email, password_hash, founding_member)
    VALUES (${email}, ${passwordHash}, ${opts.foundingMember ?? false})
    RETURNING id
  `;
  const cookie = createSessionCookie(user.id).split(";")[0]; // "tasketra_session=..."
  return { id: user.id, email, cookie };
}

/** Builds a Request as if made by an authenticated user (via session cookie). */
export function asUser(
  user: { cookie: string },
  input: { method: string; url: string; body?: unknown }
): Request {
  const headers: Record<string, string> = { cookie: user.cookie };
  if (input.body !== undefined) headers["content-type"] = "application/json";
  return new Request(input.url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });
}

export async function createTestProject(ownerId: string, name = "Test Project"): Promise<{ id: string; name: string }> {
  const database = db();
  const [project] = await database.sql<{ id: string; name: string }>`
    INSERT INTO projects (owner_id, name) VALUES (${ownerId}, ${name}) RETURNING id, name
  `;
  return project;
}

/** Inserts a documents row directly (no real blob write) -- used to seed
 *  storage totals for cap tests without uploading real files. blob_key must
 *  be unique per row; defaults to a random one if not given. */
export async function createTestDocument(
  projectId: string,
  uploadedBy: string,
  sizeBytes: number,
  opts: { filename?: string; deleted?: boolean } = {}
): Promise<{ id: string }> {
  const database = db();
  const blobKey = crypto.randomUUID();
  const [doc] = await database.sql<{ id: string }>`
    INSERT INTO documents (project_id, uploaded_by, filename, mime_type, size_bytes, blob_key, deleted_at)
    VALUES (
      ${projectId}, ${uploadedBy}, ${opts.filename ?? "test.pdf"}, 'application/pdf', ${sizeBytes}, ${blobKey},
      ${opts.deleted ? new Date().toISOString() : null}
    )
    RETURNING id
  `;
  return doc;
}

/** Response.json() types as unknown under this project's tsconfig (no DOM
 *  lib) -- this narrows it for test assertions without an inline cast at
 *  every call site. */
export async function jsonBody<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
