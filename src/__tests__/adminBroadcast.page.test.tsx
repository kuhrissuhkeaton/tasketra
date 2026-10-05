// @vitest-environment jsdom
//
// The "Email founding members" admin page: test send, confirm, batched send with progress.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "a", email: "admin@example.com", isAdmin: true }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("../components/AppSidebar", () => ({ AppSidebar: () => null }));
const confirmFn = vi.fn();
vi.mock("../components/ConfirmDialog", () => ({ useConfirm: () => confirmFn, ConfirmProvider: ({ children }: { children: unknown }) => children }));

const calls = { overview: vi.fn(), test: vi.fn(), send: vi.fn(), cont: vi.fn() };
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adminBroadcastOverview: () => calls.overview(),
      adminBroadcastTest: (s: string, b: string) => calls.test(s, b),
      adminBroadcastSend: (s: string, b: string, h: boolean, f: boolean) => calls.send(s, b, h, f),
      adminBroadcastContinue: (id: string, r: boolean) => calls.cont(id, r),
    },
  };
});

import AdminBroadcast from "../pages/AdminBroadcast";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  Object.values(calls).forEach((c) => c.mockReset());
  confirmFn.mockReset();
  calls.overview.mockResolvedValue({ audience: 12, recent: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (t: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
const render = async () => { await act(async () => { root.render(<MemoryRouter><AdminBroadcast /></MemoryRouter>); }); await flush(); };
const prog = (o: Partial<{ sent: number; pending: number; failed: number }>) => ({ id: "b1", subject: "S", created_at: "2026-10-05T00:00:00Z", total: 12, sent: 0, failed: 0, pending: 12, ...o });

describe("AdminBroadcast page", () => {
  it("shows the audience size and the drafted message", async () => {
    await render();
    expect(container.textContent).toContain("12");
    expect((container.querySelector("#broadcast-subject") as HTMLInputElement).value).toContain("first 100");
    expect((container.querySelector("#broadcast-body") as HTMLTextAreaElement).value).toContain("{first_name}");
  });

  it("sends a test to the admin", async () => {
    calls.test.mockResolvedValue({ ok: true, sentTo: "admin@example.com" });
    await render();
    await act(async () => { button("Send a test").click(); });
    await flush();
    expect(calls.test).toHaveBeenCalled();
    expect(container.textContent).toContain("Test sent to admin@example.com");
  });

  it("does nothing when the send is not confirmed", async () => {
    confirmFn.mockResolvedValue(false);
    await render();
    await act(async () => { button("Send to 12").click(); });
    await flush();
    expect(calls.send).not.toHaveBeenCalled();
  });

  it("keeps sending batches until none are pending and reports the result", async () => {
    confirmFn.mockResolvedValue(true);
    calls.send.mockResolvedValue({ progress: prog({ sent: 8, pending: 4 }), rateLimited: false });
    calls.cont.mockResolvedValue({ progress: prog({ sent: 12, pending: 0 }), rateLimited: false });
    await render();
    await act(async () => { button("Send to 12").click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    await flush();
    expect(calls.send).toHaveBeenCalledWith(expect.any(String), expect.any(String), true, false);
    expect(calls.cont).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sent to 12 founding members");
  });
});
