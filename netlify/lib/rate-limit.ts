// App-level rate limiting, backed by Postgres since Netlify Functions have
// no shared memory between invocations. Used to slow down brute-force login
// attempts, mass account creation, and forgot-password email-bombing --
// none of which cost anything to attempt against a stateless function
// without this.
//
// Each bucket is pruned to its own window before counting, so the table
// never needs a scheduled cleanup job -- a bucket that hasn't been hit
// recently costs nothing to check.

export function getClientIp(req: Request): string {
  // Netlify sets this on every function invocation; x-forwarded-for is a
  // fallback for local/other environments and may contain a chain, so take
  // the first (client) address.
  const nfIp = req.headers.get("x-nf-client-connection-ip");
  if (nfIp) return nfIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Returns true if the request is allowed (and records this attempt).
 * Returns false if the bucket has already hit `maxAttempts` within the
 * trailing `windowMinutes` -- the caller should respond 429 and not record
 * anything further for this attempt.
 */
export async function checkRateLimit(
  database: any,
  bucket: string,
  maxAttempts: number,
  windowMinutes: number
): Promise<boolean> {
  await database.sql`
    DELETE FROM rate_limit_hits
    WHERE bucket = ${bucket} AND created_at < now() - (${windowMinutes} || ' minutes')::interval
  `;
  const [{ count }] = await database.sql`
    SELECT count(*)::int AS count FROM rate_limit_hits WHERE bucket = ${bucket}
  `;
  if (count >= maxAttempts) return false;
  await database.sql`INSERT INTO rate_limit_hits (bucket) VALUES (${bucket})`;
  return true;
}
