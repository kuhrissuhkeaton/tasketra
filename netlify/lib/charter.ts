// The in-app project charter: a handful of short text fields stored as one
// JSON object on the project. Pure helpers here so the server and the tests
// share one definition of what a charter is and when it counts as written.

export const CHARTER_FIELDS = [
  "purpose", "objectives", "scope_in", "scope_out", "sponsor", "budget", "timeline", "success",
] as const;

export type CharterField = (typeof CHARTER_FIELDS)[number];
export type Charter = Partial<Record<CharterField, string>>;

export const CHARTER_MAX_LENGTH = 5000;

/** The fields a Light project shows; the rest appear when it grows. */
export const CHARTER_LIGHT_FIELDS: CharterField[] = ["purpose", "objectives", "scope_in", "scope_out", "sponsor"];

/** Keeps only known fields, trims them, caps their length, drops empties.
 *  Returns null when the input is not a plain object. */
export function sanitizeCharter(input: unknown): Charter | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Charter = {};
  for (const key of CHARTER_FIELDS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, CHARTER_MAX_LENGTH);
    if (t) out[key] = t;
  }
  return out;
}

/** A charter counts as written once it says why the project exists. */
export function charterWritten(charter: unknown): boolean {
  const c = sanitizeCharter(charter);
  return !!c && !!c.purpose;
}

/** Complete means the four essentials are filled in. */
export function charterComplete(charter: unknown): boolean {
  const c = sanitizeCharter(charter);
  return !!c && !!c.purpose && !!c.objectives && !!c.scope_in && !!c.sponsor;
}

/** One objective per non-empty line, with any "1." "-" or bullet prefix removed. */
export function charterObjectiveLines(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}
