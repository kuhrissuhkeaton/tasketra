// Admin emails to founding members. A broadcast is created once with its full
// recipient list, then sent in small batches (the caller keeps asking for the
// next batch until nothing is pending). Every recipient row is claimed with a
// status change before the email goes out, so repeating or overlapping
// requests never send the same person two copies.

import { getEnv } from "./env.ts";
import { sendEmail } from "./notify.ts";

export const MAX_SUBJECT = 150;
export const MAX_BODY = 10000;
export const BATCH_SIZE = 8;
// Resend allows about two requests a second on a default account.
const SEND_GAP_MS = 600;
const STALE_CLAIM_MINUTES = 2;

export const FOOTER =
  "\n\n--\nYou're getting this because you have a Tasketra founding member account. " +
  "If you'd rather not get updates like this, just reply and tell me.";

export type Sender = (to: string, subject: string, text: string, replyTo?: string) => Promise<{ sent: boolean; reason?: string }>;

export function firstNameOf(displayName: string | null | undefined): string {
  const first = (displayName || "").trim().split(/\s+/)[0] || "";
  return first.slice(0, 40);
}

/** Fills {first_name} (or {{first_name}}); someone with no name on file gets "there". */
export function renderBody(body: string, firstName: string | null | undefined): string {
  const name = firstName && firstName.trim() ? firstName.trim() : "there";
  return body.replace(/\{\{\s*first_name\s*\}\}|\{\s*first_name\s*\}/g, name) + FOOTER;
}

export function validateBroadcast(subject: unknown, body: unknown): string | null {
  if (typeof subject !== "string" || !subject.trim()) return "A subject is required.";
  if (typeof body !== "string" || !body.trim()) return "A message is required.";
  if (subject.length > MAX_SUBJECT) return `The subject can be at most ${MAX_SUBJECT} characters.`;
  if (body.length > MAX_BODY) return `The message can be at most ${MAX_BODY} characters.`;
  if (/[\r\n]/.test(subject)) return "The subject must be one line.";
  return null;
}

/** Founding members who have confirmed their email. */
export async function countFoundingAudience(database: any): Promise<number> {
  const [{ count }] = await database.sql`
    SELECT count(*)::int AS count FROM users WHERE founding_member = true AND email_verified_at IS NOT NULL
  `;
  return count;
}

export class DuplicateBroadcastError extends Error {}

export async function createBroadcast(
  database: any,
  adminId: string,
  input: { subject: string; body: string; holdCheckin: boolean; force?: boolean }
): Promise<{ id: string; total: number }> {
  if (!input.force) {
    const [dupe] = await database.sql`
      SELECT id FROM admin_broadcasts
      WHERE subject = ${input.subject} AND body = ${input.body} AND created_at > now() - interval '24 hours'
    `;
    if (dupe) throw new DuplicateBroadcastError("This exact message was already sent in the last 24 hours.");
  }
  const [broadcast] = await database.sql`
    INSERT INTO admin_broadcasts (audience, subject, body, hold_checkin, created_by)
    VALUES ('founding', ${input.subject}, ${input.body}, ${input.holdCheckin}, ${adminId})
    RETURNING id
  `;
  await database.sql`
    INSERT INTO admin_broadcast_recipients (broadcast_id, email, user_id, first_name)
    SELECT ${broadcast.id}, u.email, u.id, split_part(trim(COALESCE(u.display_name, '')), ' ', 1)
    FROM users u
    WHERE u.founding_member = true AND u.email_verified_at IS NOT NULL
    ON CONFLICT DO NOTHING
  `;
  const [{ count }] = await database.sql`SELECT count(*)::int AS count FROM admin_broadcast_recipients WHERE broadcast_id = ${broadcast.id}`;
  return { id: broadcast.id, total: count };
}

export type BroadcastProgress = { id: string; subject: string; created_at: string; total: number; sent: number; failed: number; pending: number };

export async function broadcastProgress(database: any, id: string): Promise<BroadcastProgress | null> {
  const [row] = await database.sql`
    SELECT b.id, b.subject, b.created_at,
      count(r.*)::int AS total,
      count(r.*) FILTER (WHERE r.status = 'sent')::int AS sent,
      count(r.*) FILTER (WHERE r.status = 'failed')::int AS failed,
      count(r.*) FILTER (WHERE r.status IN ('pending', 'sending'))::int AS pending
    FROM admin_broadcasts b LEFT JOIN admin_broadcast_recipients r ON r.broadcast_id = b.id
    WHERE b.id = ${id}
    GROUP BY b.id
  `;
  return row ?? null;
}

export async function recentBroadcasts(database: any, limit = 10): Promise<BroadcastProgress[]> {
  const rows = await database.sql`SELECT id FROM admin_broadcasts ORDER BY created_at DESC LIMIT ${limit}`;
  const out: BroadcastProgress[] = [];
  for (const r of rows) {
    const p = await broadcastProgress(database, r.id);
    if (p) out.push(p);
  }
  return out;
}

/** Turns failed recipients back into pending so the next batch tries them again. */
export async function retryFailed(database: any, broadcastId: string): Promise<void> {
  await database.sql`
    UPDATE admin_broadcast_recipients SET status = 'pending', error = NULL
    WHERE broadcast_id = ${broadcastId} AND status = 'failed'
  `;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends the next few pending recipients. Safe to call repeatedly and concurrently. */
export async function sendNextBatch(
  database: any,
  broadcastId: string,
  opts: { send?: Sender; gapMs?: number; limit?: number } = {}
): Promise<{ progress: BroadcastProgress; rateLimited: boolean }> {
  const send = opts.send ?? sendEmail;
  const gap = opts.gapMs ?? SEND_GAP_MS;
  const limit = opts.limit ?? BATCH_SIZE;

  const [broadcast] = await database.sql`SELECT subject, body, hold_checkin FROM admin_broadcasts WHERE id = ${broadcastId}`;
  if (!broadcast) throw new Error("Broadcast not found");
  const replyTo = getEnv("ADMIN_EMAIL") || undefined;

  // A batch that died part-way leaves rows marked "sending"; free them up.
  await database.sql`
    UPDATE admin_broadcast_recipients SET status = 'pending'
    WHERE broadcast_id = ${broadcastId} AND status = 'sending' AND claimed_at < now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval
  `;

  const claimed = await database.sql`
    UPDATE admin_broadcast_recipients SET status = 'sending', claimed_at = now()
    WHERE broadcast_id = ${broadcastId} AND status = 'pending' AND email IN (
      SELECT email FROM admin_broadcast_recipients WHERE broadcast_id = ${broadcastId} AND status = 'pending' ORDER BY email LIMIT ${limit}
    )
    RETURNING email, user_id, first_name
  `;

  let rateLimited = false;
  for (let i = 0; i < claimed.length; i++) {
    const r = claimed[i];
    if (rateLimited) {
      await database.sql`UPDATE admin_broadcast_recipients SET status = 'pending' WHERE broadcast_id = ${broadcastId} AND email = ${r.email}`;
      continue;
    }
    let result: { sent: boolean; reason?: string };
    try {
      result = await send(r.email, broadcast.subject, renderBody(broadcast.body, r.first_name), replyTo);
    } catch (err) {
      result = { sent: false, reason: err instanceof Error ? err.message : "send_error" };
    }
    if (result.sent) {
      await database.sql`
        UPDATE admin_broadcast_recipients SET status = 'sent', sent_at = now(), error = NULL
        WHERE broadcast_id = ${broadcastId} AND email = ${r.email}
      `;
      if (broadcast.hold_checkin && r.user_id) {
        // Push this person's next automatic check-in about a week out (it goes
        // out once 13 days have passed since this timestamp).
        await database.sql`
          UPDATE users SET last_pulse_sent_at = GREATEST(COALESCE(last_pulse_sent_at, '-infinity'::timestamptz), now() - interval '6 days')
          WHERE id = ${r.user_id}
        `;
      }
    } else if (result.reason === "resend_error_429") {
      rateLimited = true;
      await database.sql`UPDATE admin_broadcast_recipients SET status = 'pending' WHERE broadcast_id = ${broadcastId} AND email = ${r.email}`;
    } else {
      await database.sql`
        UPDATE admin_broadcast_recipients SET status = 'failed', error = ${(result.reason || "unknown").slice(0, 200)}
        WHERE broadcast_id = ${broadcastId} AND email = ${r.email}
      `;
    }
    if (gap > 0 && i < claimed.length - 1) await sleep(gap);
  }

  const progress = (await broadcastProgress(database, broadcastId))!;
  return { progress, rateLimited };
}
