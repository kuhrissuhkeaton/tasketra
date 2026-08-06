import * as Sentry from "@sentry/node";
import { getEnv } from "./env.ts";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  const dsn = getEnv("SENTRY_DSN");
  if (!dsn) return; // no-op if not configured, same convention as notify.ts
  Sentry.init({
    dsn,
    tracesSampleRate: 0, // error tracking only, no perf tracing overhead
    environment: getEnv("CONTEXT") || "production",
  });
}

/**
 * Wraps a Netlify Function handler so any uncaught throw is reported to
 * Sentry before the caller gets a clean 500. Handlers already return their
 * own error responses (400/401/404) for expected cases -- this only catches
 * genuine bugs/unexpected failures that would otherwise be an unlogged,
 * unalerted crash.
 */
export function withSentry<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    ensureInit();
    try {
      return await fn(...args);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000).catch(() => {});
      console.error(err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  };
}
