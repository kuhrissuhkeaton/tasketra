import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, clearApiCache } from "../api";

// The GET cache in api.ts is stale-while-revalidate: a repeat read resolves
// with the cached copy while a fresh one loads behind it, and any mutation
// clears the cache. v157 guards the write-backs with a generation counter:
// a fetch that started BEFORE a mutation must not put its (pre-mutation)
// response back into the cache when it lands afterwards. That resurrection
// was the live bug behind the project header keeping its pre-check-in
// health after a check-in was posted, until a reload -- but only when a
// background revalidation happened to straddle the save, which is why it
// looked intermittent.

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearApiCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api GET cache", () => {
  it("serves a repeat read from the cache and revalidates behind it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: ["v1"] }));
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["v1"] });

    // Second read: cached copy returns; the background revalidate gets v2
    // and replaces the cache entry for next time.
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: ["v2"] }));
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["v1"] });
    await flush();

    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: ["v3"] }));
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["v2"] });
  });

  it("never lets a revalidation that straddled a mutation resurrect stale data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: ["before"] }));
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["before"] });

    // Start a second read: the cached copy returns instantly and the
    // background revalidation hangs in flight...
    const revalidation = deferred<Response>();
    fetchMock.mockReturnValueOnce(revalidation.promise);
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["before"] });

    // ...while a mutation (a check-in save, say) lands and clears the cache.
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await api.deleteRisk("r1");

    // The revalidation now resolves with the data it fetched BEFORE the
    // mutation. It must not re-enter the cache.
    revalidation.resolve(jsonResponse({ projects: ["before"] }));
    await flush();

    // So the next read fetches fresh instead of serving the resurrected
    // stale entry.
    fetchMock.mockResolvedValueOnce(jsonResponse({ projects: ["after"] }));
    await expect(api.getPortfolio("p1")).resolves.toEqual({ projects: ["after"] });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/portfolio"))).toHaveLength(3);
  });
});
