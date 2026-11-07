import { getEnv } from "./env.ts";
import type { AdminIdentity } from "./accountRemoval.ts";

/** Strict admin check for destructive actions. Unlike the older read-only
 *  admin pages (which treat everyone as admin while ADMIN_EMAIL is unset),
 *  this fails closed: with no ADMIN_EMAIL configured, nobody is an admin, so a
 *  missing setting can never expose account deletion to every signed-in user. */
export async function getStrictAdmin(database: any, userId: string): Promise<AdminIdentity | null> {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return null;
  const [user] = await database.sql`SELECT id, email FROM users WHERE id = ${userId}`;
  if (!user || user.email.toLowerCase() !== adminEmail.trim().toLowerCase()) return null;
  return { id: user.id, email: user.email };
}

/** The one email comparison behind every admin check: true only when the
 *  given address matches ADMIN_EMAIL. Fails closed — with ADMIN_EMAIL unset,
 *  no address is an admin address. Use this when the caller already has the
 *  user's email; use getStrictAdmin when it only has a user id. */
export function isAdminEmail(email: string | null | undefined): boolean {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.trim().toLowerCase();
}
