import type { ChangeEntry } from "./whatsNewData";

/** What's new entries the person has not seen yet, newest first. `changes` is
 * ordered newest first, so everything above the last version they saw is new.
 * Returns nothing when we do not know what they last saw (a brand-new account,
 * or a version that is no longer in the list) so nobody is greeted with a pile
 * of old entries. */
export function unseenWhatsNew(changes: ChangeEntry[], seenVersion: string | null | undefined): ChangeEntry[] {
  if (!seenVersion) return [];
  const idx = changes.findIndex((c) => c.version === seenVersion);
  if (idx <= 0) return [];
  return changes.slice(0, idx);
}

/** The text shown on the bell's badge: nothing for zero, "9+" past nine. */
export function badgeText(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}
