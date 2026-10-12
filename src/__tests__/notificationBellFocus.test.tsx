// @vitest-environment jsdom
//
// Batch C: opening the bell panel moves focus into it, Tab stays inside, Escape returns to the bell.
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "../components/NotificationBell";
import { CHANGES } from "../lib/whatsNewData";

let container: HTMLDivElement;
let root: Root | null = null;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null; container?.remove();
  document.body.querySelectorAll(".notif-panel").forEach((n) => n.remove());
  vi.unstubAllGlobals();
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(<MemoryRouter initialEntries={["/app"]}><NotificationBell /></MemoryRouter>); });
  await flush();
}
const bell = () => container.querySelector<HTMLButtonElement>(".sidebar-bell-btn")!;
const key = (el: Element | Document, k: string, shift = false) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true })); });

describe("notification bell focus", () => {
  it("moves focus to the first control when opened, wraps Tab at both ends, and Escape returns to the bell", async () => {
    await mount({
      items: [
        { id: "d:1", type: "decision_response", text: "Maya answered", at: new Date().toISOString(), unread: true, to: "/app/projects/p1?tab=decisions" },
        { id: "d:2", type: "decision_response", text: "Sam answered", at: new Date().toISOString(), unread: true, to: "/app/projects/p1?tab=decisions" },
      ],
      whatsNewSeen: CHANGES[0].version,
    });
    act(() => bell().click());
    await flush();
    const panel = document.querySelector<HTMLElement>(".notif-panel")!;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
    expect(focusables.length).toBeGreaterThanOrEqual(3);
    expect(document.activeElement).toBe(focusables[0]);
    focusables[focusables.length - 1].focus();
    key(focusables[focusables.length - 1], "Tab");
    expect(document.activeElement).toBe(focusables[0]);
    key(focusables[0], "Tab", true);
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
    key(document, "Escape");
    expect(document.querySelector(".notif-panel")).toBeNull();
    expect(document.activeElement).toBe(bell());
  });

  it("focuses the panel itself when there is nothing to act on", async () => {
    await mount({ items: [], whatsNewSeen: CHANGES[0].version });
    act(() => bell().click());
    await flush();
    expect(document.activeElement).toBe(document.querySelector(".notif-panel"));
  });
});
