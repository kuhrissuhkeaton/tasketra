// Kinds of document that can be shared by link. Add new kinds here (and to
// the public endpoint's payload builder) -- no migration needed.
export const SHARE_KINDS = ["risk-matrix", "raci"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export function isShareKind(value: unknown): value is ShareKind {
  return typeof value === "string" && (SHARE_KINDS as readonly string[]).includes(value);
}
