/** Deterministic initial-circle avatar helpers -- the rebrand uses colored
 * initial circles instead of image avatars anywhere a person needs a visual
 * marker (member rows, workload tables, task cards). */

/** Avatar pastels are the design tokens, not local hexes: the three --tag-
 *  colors, the brand lime, and --avatar-peach (defined beside them in
 *  index.css for exactly this list). */
const AVATAR_COLORS = ["var(--tag-tan)", "var(--tag-sage)", "var(--tag-lavender)", "var(--lime)", "var(--avatar-peach)"];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "?";
  const namePart = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
  const parts = namePart.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return trimmed[0]?.toUpperCase() || "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
