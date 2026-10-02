/** The Postgres error code (e.g. "23505" unique violation, "23503" foreign-key
 *  violation) from a failed query. The database driver wraps the original
 *  error, so the code can sit on the error itself or on its `cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/** The name of the constraint involved in a failed query, when there is one. */
export function pgErrorConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: unknown; cause?: { constraint?: unknown } } | null | undefined;
  const c = e?.constraint ?? e?.cause?.constraint;
  return typeof c === "string" ? c : undefined;
}
