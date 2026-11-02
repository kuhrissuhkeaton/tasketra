export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json");
  // Every response from this API is per-user and changes with the last write.
  // Without an explicit no-store, browsers may heuristically cache a GET and
  // hand the pre-write response back to the refetch that follows a save --
  // which is exactly how "Task added." could sit next to "No tasks yet".
  // no-store also keeps authenticated data out of any shared cache.
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}
