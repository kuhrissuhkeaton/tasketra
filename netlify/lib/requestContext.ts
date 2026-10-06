// Remembers who is signed in for the length of one request, so shared helpers
// (today: logActivity) can record the author without every caller passing it.
// withSentry sets it for every function. Requests with no valid session, such
// as public decision links or the Stripe webhook, have no author (null).
import { AsyncLocalStorage } from "node:async_hooks";
import { getUserIdFromRequest } from "./auth.ts";

const storage = new AsyncLocalStorage<{ userId: string | null }>();

export function runWithUser<T>(userId: string | null, fn: () => T): T {
  return storage.run({ userId }, fn);
}

export function runForRequest<T>(req: unknown, fn: () => T): T {
  let userId: string | null = null;
  try {
    userId = req instanceof Request ? getUserIdFromRequest(req) : null;
  } catch {
    userId = null; // a bad or missing session secret must never break a public endpoint
  }
  return storage.run({ userId }, fn);
}

export function currentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
