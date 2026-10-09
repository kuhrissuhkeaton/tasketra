// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "../components/NotificationBell";
import { CHANGES } from "../lib/whatsNewData";

let container: HTMLDivElement;
let root: Root | null = null;
const calls: { url: string; method: string; body: string | null }[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
  document.body.querySelectorAll(".notif-panel").forEach((n) => n.remove());
  calls.length = 0;
  vi.unstubAllGlobals();
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(payload: unknown, path = "/app") {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || "GET", body: (init?.body as string) ?? null });
    return new Response(JSON.stringify(init?.method === "PATCH" ? { ok: true } : payload));
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<MemoryRouter initialEntries={[path]}><NotificationBell /></MemoryRouter>); });
  await flush();
}

const bell = () => container.querySelector<HTMLButtonElement>(".sidebar-bell-btn")!;
const badge = () => container.querySelector(".sidebar-bell-badge")?.textContent ?? null;
const older = CHANGES[CHANGES.length - 1].version; // the oldest entry: everything above it is "new"

describe("notification bell", () => {
  it("shows no badge when there is nothing new", async () => {
    await mount({ items: [], whatsNewSeen: CHANGES[0].version });
    expect(badge()).toBeNull();
    expect(bell().getAttribute("aria-label")).toBe("Notifications");
  });

  it("counts unread server items and unseen What's new entries", async () => {
    await mount({
      items: [
        { id: "decision:1", type: "decision_response", text: 'Maya answered "Vendor": Approve', at: new Date().toISOString(), unread: true, to: "/app/projects/p1?tab=decisions" },
        { id: "feedback:1", type: "feedback_update", text: 'Your feedback shipped: "Dark mode"', at: new Date().toISOString(), unread: false, to: "/app/whats-new" },
      ],
      whatsNewSeen: CHANGES[1].version, // one entry newer than what they saw
    });
    expect(badge()).toBe("2");
    expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread");
  });

  it("opens a list with links, and closes on Escape", async () => {
    await mount({
      items: [{ id: "decision:1", type: "decision_response", text: 'Maya answered "Vendor": Approve', at: new Date().toISOString(), unread: true, to: "/app/projects/p1?tab=decisions" }],
      whatsNewSeen: CHANGES[0].version,
    });
    act(() => { bell().click(); });
    await flush();
    const panel = document.body.querySelector(".notif-panel")!;
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain("Maya answered");
    expect(panel.querySelector("a")!.getAttribute("href")).toBe("/app/projects/p1?tab=decisions");
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.body.querySelector(".notif-panel")).toBeNull();
  });

  it("shows an all-caught-up message when empty", async () => {
    await mount({ items: [], whatsNewSeen: CHANGES[0].version });
    act(() => { bell().click(); });
    await flush();
    expect(document.body.querySelector(".notif-panel")!.textContent).toContain("all caught up");
  });

  it("Mark all read clears the badge and tells the server", async () => {
    await mount({
      items: [{ id: "decision:1", type: "decision_response", text: "x", at: new Date().toISOString(), unread: true, to: "/app" }],
      whatsNewSeen: CHANGES[1].version,
    });
    expect(badge()).toBe("2");
    act(() => { bell().click(); });
    await flush();
    const btn = Array.from(document.body.querySelectorAll<HTMLButtonElement>(".notif-panel button")).find((b) => b.textContent === "Mark all read")!;
    act(() => { btn.click(); });
    await flush();
    expect(badge()).toBeNull();
    const patches = calls.filter((c) => c.method === "PATCH").map((c) => c.body);
    expect(patches).toContain(JSON.stringify({ markAllRead: true }));
    expect(patches).toContain(JSON.stringify({ whatsNewSeen: CHANGES[0].version }));
  });

  it("starts a brand-new account at the latest entry instead of showing every old one", async () => {
    await mount({ items: [], whatsNewSeen: null });
    expect(badge()).toBeNull();
    expect(calls.some((c) => c.method === "PATCH" && c.body === JSON.stringify({ whatsNewSeen: CHANGES[0].version }))).toBe(true);
  });

  it("visiting the What's new page counts the entries as seen", async () => {
    await mount({ items: [], whatsNewSeen: older }, "/app/whats-new");
    expect(badge()).toBeNull();
    expect(calls.some((c) => c.method === "PATCH" && c.body === JSON.stringify({ whatsNewSeen: CHANGES[0].version }))).toBe(true);
  });

  it("shows nothing, and does not crash, when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<MemoryRouter><NotificationBell /></MemoryRouter>); });
    await flush();
    expect(badge()).toBeNull();
    expect(bell()).toBeTruthy();
  });
});
