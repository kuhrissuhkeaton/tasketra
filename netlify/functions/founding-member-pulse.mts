import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getEnv } from "../lib/env.ts";
import { sendEmail } from "../lib/notify.ts";
import { withSentry } from "../lib/sentry.ts";

// A short, personal check-in to founding members -- not a survey widget,
// just a plain email inviting a reply. Runs weekly, but each person only
// actually gets emailed once every 13+ days (tracked via
// users.last_pulse_sent_at), so the effective cadence per person is
// roughly biweekly even though the schedule itself is simpler to reason
// about as "check every week, skip anyone not due yet."
//
// Reply-to is ADMIN_EMAIL when set, so replies land in a real inbox
// instead of the automated info@ address -- the whole point is that
// someone reads them.

const COOLDOWN_DAYS = 13;

export default withSentry(async () => {
  const database = db();
  const adminEmail = getEnv("ADMIN_EMAIL");

  const due = await database.sql`
    SELECT id, email FROM users
    WHERE founding_member = true
      AND (last_pulse_sent_at IS NULL OR last_pulse_sent_at < now() - (${COOLDOWN_DAYS} || ' days')::interval)
  `;

  let sent = 0;
  const errors: string[] = [];

  for (const user of due) {
    try {
      const result = await sendEmail(
        user.email,
        "How's Tasketra working for you?",
        `Hi,\n\nQuick check-in since you're one of the first people actually using Tasketra: how's it going?` +
          ` Anything missing, confusing, or just annoying?\n\nHit reply and tell me -- I read every one, and it` +
          ` genuinely shapes what gets built next.\n\n-- Karissa`,
        adminEmail || undefined
      );
      if (result.sent) {
        await database.sql`UPDATE users SET last_pulse_sent_at = now() WHERE id = ${user.id}`;
        sent++;
      } else {
        errors.push(`${user.email}: ${result.reason}`);
      }
    } catch (err) {
      errors.push(`${user.email}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, due: due.length, sent, errors }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

export const config: Config = { schedule: "0 15 * * 3" };
