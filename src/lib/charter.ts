// Front-end mirror of netlify/lib/charter.ts: the charter's fields, which of
// them a Light project shows, and the small text helpers the Charter tab uses.

export type CharterField = "purpose" | "objectives" | "scope_in" | "scope_out" | "sponsor" | "budget" | "timeline" | "success";
export type Charter = Partial<Record<CharterField, string>>;

/** Fields shown to a Light project. Others appear once it grows, or when they already hold text. */
export const CHARTER_LIGHT_FIELDS: CharterField[] = ["purpose", "objectives", "scope_in", "scope_out", "sponsor"];

export function isCharterComplete(c: Charter | undefined): boolean {
  return !!c && !!c.purpose?.trim() && !!c.objectives?.trim() && !!c.scope_in?.trim() && !!c.sponsor?.trim();
}

/** One objective per non-empty line, with any "1." "-" or bullet prefix removed. */
export function objectiveLines(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

export function cleanCharter(c: Charter): Charter {
  const out: Charter = {};
  (Object.keys(c) as CharterField[]).forEach((k) => {
    const v = c[k]?.trim();
    if (v) out[k] = v;
  });
  return out;
}

export function sameCharter(a: Charter, b: Charter): boolean {
  return JSON.stringify(cleanCharter(a)) === JSON.stringify(cleanCharter(b));
}
