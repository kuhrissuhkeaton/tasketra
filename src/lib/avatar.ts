/** Deterministic initial-circle avatar helpers -- the rebrand uses colored
 * initial circles instead of image avatars anywhere a person needs a visual
 * marker (member rows, workload tables, task cards). */

const AVATAR_COLORS = ["#F3D8B0", "#D8E4C8", "#E9D8F0", "#CFEA46", "#F6D6C6"];

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
