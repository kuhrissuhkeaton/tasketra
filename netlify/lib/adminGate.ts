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
