// Admin tools for taking an account out of the system: remove only its
// founding-member status, or delete the whole account and its data.
//
// Deleting is done as a fixed sequence of steps, each safe to run again, so if
// something fails part-way the admin can simply press the button again. (The
// database driver doesn't give us a transaction across separate queries.)
//
// Foreign keys from other tables to users either cascade, set null, or are
// "no action". The no-action ones are the ones this file must clean up by
// hand: projects.owner_id, documents.uploaded_by, users.referred_by and
// roadmap_items.created_by. A test walks the live schema and fails if a new
// table adds another no-action link to users without it being handled here.

import { pgErrorCode, pgErrorConstraint } from "./pgError.ts";
import { canonicalEmail } from "./accountRules.ts";

export const HANDLED_NO_ACTION_LINKS = [
  "projects.owner_id",
  "documents.uploaded_by",
  "users.referred_by",
  "roadmap_items.created_by",
];

export type AdminIdentity = { id: string; email: string };

export type RemovalBlocker = {
  code: "self" | "admin" | "subscription" | "shared_project";
  message: string;
};

export type RemovalPreview = {
  user: { id: string; email: string; display_name: string | null; founding_member: boolean };
  projects: number;
  documents: number;
  subscriptionStatus: string | null;
  sharedProjects: { id: string; name: string; otherMembers: number }[];
  blockers: RemovalBlocker[];
};

const LIVE_SUBSCRIPTION = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];

export async function previewRemoval(
  database: any,
  targetId: string,
  admin: AdminIdentity
): Promise<RemovalPreview | null> {
  const [user] = await database.sql`
    SELECT id, email, display_name, founding_member FROM users WHERE id = ${targetId}
  `;
  if (!user) return null;

  const [{ projects }] = await database.sql`
    SELECT count(*)::int AS projects FROM projects WHERE owner_id = ${targetId}
  `;
  const [{ documents }] = await database.sql`
    SELECT count(*)::int AS documents
    FROM documents d JOIN projects p ON p.id = d.project_id
    WHERE p.owner_id = ${targetId}
  `;
  const [sub] = await database.sql`SELECT status FROM subscriptions WHERE user_id = ${targetId}`;
  const sharedProjects = await database.sql`
    SELECT p.id, p.name, count(m.id)::int AS "otherMembers"
    FROM projects p
    JOIN project_members m ON m.project_id = p.id
    WHERE p.owner_id = ${targetId} AND (m.user_id IS NULL OR m.user_id <> ${targetId})
    GROUP BY p.id, p.name
  `;

  const blockers: RemovalBlocker[] = [];
  if (user.id === admin.id) {
    blockers.push({ code: "self", message: "You can't remove your own account from here." });
  } else if (user.email.toLowerCase() === admin.email.toLowerCase()) {
    blockers.push({ code: "admin", message: "This is the admin account." });
  }
  if (sub?.status && LIVE_SUBSCRIPTION.includes(sub.status)) {
    blockers.push({
      code: "subscription",
      message: `This account has a ${sub.status} subscription. Cancel it in Stripe first.`,
    });
  }
  if (sharedProjects.length > 0) {
    const names = sharedProjects.map((p: any) => p.name).join(", ");
    blockers.push({
      code: "shared_project",
      message: `This account owns a project with other people on it (${names}). Deleting would remove their work. Ask the owner to hand it over or remove the other members first.`,
    });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      founding_member: !!user.founding_member,
    },
    projects,
    documents,
    subscriptionStatus: sub?.status ?? null,
    sharedProjects,
    blockers,
  };
}

async function logAction(
  database: any,
  admin: AdminIdentity,
  action: string,
  target: { id: string; email: string },
  details: Record<string, unknown>
) {
  await database.sql`
    INSERT INTO admin_actions (admin_user_id, admin_email, action, target_user_id, target_email, details)
    VALUES (${admin.id}, ${admin.email}, ${action}, ${target.id}, ${target.email}, ${JSON.stringify(details)}::jsonb)
  `;
}

export type RemovalResult =
  | { ok: true; details: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function removeFoundingStatus(
  database: any,
  targetId: string,
  admin: AdminIdentity
): Promise<RemovalResult> {
  const preview = await previewRemoval(database, targetId, admin);
  if (!preview) return { ok: false, status: 404, error: "Account not found." };
  if (!preview.user.founding_member) {
    return { ok: false, status: 400, error: "This account doesn't hold a founding spot." };
  }
  if (preview.user.email.toLowerCase() === admin.email.toLowerCase()) {
    return { ok: false, status: 400, error: "This is the admin account. Its founding status can't be removed here." };
  }
  await database.sql`UPDATE users SET founding_member = false WHERE id = ${targetId}`;
  const details = { projects: preview.projects };
  await logAction(database, admin, "remove_founding", preview.user, details);
  return { ok: true, details };
}

export type BlobDeleter = (store: "documents" | "avatars", key: string) => Promise<void>;

export async function deleteAccount(
  database: any,
  targetId: string,
  admin: AdminIdentity,
  deleteBlob: BlobDeleter
): Promise<RemovalResult> {
  const preview = await previewRemoval(database, targetId, admin);
  if (!preview) return { ok: false, status: 404, error: "Account not found." };
  if (preview.blockers.length > 0) {
    return { ok: false, status: 409, error: preview.blockers[0].message };
  }

  // 1. Uploaded files that belong to projects this account owns.
  const docs = await database.sql`
    SELECT d.blob_key FROM documents d JOIN projects p ON p.id = d.project_id WHERE p.owner_id = ${targetId}
  `;
  let blobsFailed = 0;
  for (const d of docs) {
    try {
      await deleteBlob("documents", d.blob_key);
    } catch {
      blobsFailed += 1;
    }
  }
  try {
    await deleteBlob("avatars", targetId);
  } catch {
    /* no avatar, or already gone */
  }

  // 2. Files this account uploaded into someone else's project stay with that
  //    project: their "uploaded by" moves to the project's owner.
  await database.sql`
    UPDATE documents SET uploaded_by = p.owner_id
    FROM projects p
    WHERE documents.project_id = p.id AND documents.uploaded_by = ${targetId} AND p.owner_id <> ${targetId}
  `;

  // 3. Their own projects (and, by cascade, everything inside them).
  await database.sql`DELETE FROM projects WHERE owner_id = ${targetId}`;

  // 4. Plain references that should just become blank.
  await database.sql`UPDATE users SET referred_by = NULL WHERE referred_by = ${targetId}`;
  await database.sql`UPDATE roadmap_items SET created_by = NULL WHERE created_by = ${targetId}`;

  // 5. Delete the account (subscription row, project memberships, reset
  //    tokens, feedback and saved templates cascade), then leave a record.
  const details = { projects: preview.projects, documents: preview.documents, blobsFailed, wasFounding: preview.user.founding_member };
  try {
    await database.sql`DELETE FROM users WHERE id = ${targetId}`;
  } catch (err: any) {
    if (pgErrorCode(err) === "23503") {
      return {
        ok: false,
        status: 500,
        error: `The account is still linked to other data (${pgErrorConstraint(err) || "unknown link"}). Nothing more was deleted; tell the developer.`,
      };
    }
    throw err;
  }
  await logAction(database, admin, "delete_account", preview.user, details);
  return { ok: true, details };
}

/** Gives the "same mailbox" protection back to accounts that were left without
 *  it. When the migration found old duplicates it kept the value on the
 *  earliest account only; if that account is later removed, the one left behind
 *  has no value, so a new sign-up using another spelling of its address could
 *  slip through. This fills in any blank value that nobody else holds. Safe to
 *  run any time. */
export async function healCanonicalEmails(database: any): Promise<number> {
  const rows = await database.sql`SELECT id, email, email_canonical FROM users ORDER BY created_at, id`;
  const held = new Set<string>(rows.filter((r: any) => r.email_canonical).map((r: any) => r.email_canonical));
  let healed = 0;
  for (const r of rows) {
    if (r.email_canonical) continue;
    const canon = canonicalEmail(r.email);
    if (held.has(canon)) continue;
    await database.sql`UPDATE users SET email_canonical = ${canon} WHERE id = ${r.id} AND email_canonical IS NULL`;
    held.add(canon);
    healed += 1;
  }
  return healed;
}
