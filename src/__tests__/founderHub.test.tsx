// @vitest-environment jsdom
//
// The Founder hub: badge, referral link, and the opt-in founders' wall.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

const state = { user: { id: "u1", email: "f@x.co", plan: "founding", display_name: "Fay" } as any };
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: state.user, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({
  getFoundingMe: vi.fn(),
  setFoundingWallOptIn: vi.fn(),
  getFoundingWall: vi.fn(),
  getReferrals: vi.fn(),
}));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import Founding from "../pages/Founding";

const ME = { number: 7, since: "2026-08-02T12:00:00Z", cap: 100, wallOptIn: false };
let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  state.user = { id: "u1", email: "f@x.co", plan: "founding", display_name: "Fay" };
  m.getFoundingMe.mockReset().mockResolvedValue(ME);
  m.setFoundingWallOptIn.mockReset();
  m.getFoundingWall.mockReset().mockResolvedValue({ members: [{ number: 1, name: "Ann" }] });
  m.getReferrals.mockReset().mockResolvedValue({ link: "https://app.tasketra.com/login?mode=register&ref=abc12345", totalReferred: 3, totalRewarded: 0, referred: [] });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderPage() {
  await act(async () => { root.render(<MemoryRouter initialEntries={["/app/founding"]}><Founding /></MemoryRouter>); });
}

describe("Founder hub", () => {
  it("shows the Founder hub link in the sidebar for a founder", async () => {
    await renderPage();
    expect(container.querySelector('a[href="/app/founding"]')?.textContent).toContain("Founder hub");
  });

  it("does not show the sidebar link to a free user", async () => {
    state.user = { id: "u2", email: "free@x.co", plan: "free" };
    await renderPage();
    expect(container.querySelector('a[href="/app/founding"]')).toBeNull();
  });

  it("shows the badge number, join year, referral link and count, and the wall", async () => {
    await renderPage();
    const text = container.textContent ?? "";
    expect(text).toContain("Founding Member #7");
    expect(text).toContain("2026");
    expect(text).toContain("Pro is free for you, forever.");
    const input = container.querySelector('input[aria-label="Your referral link"]') as HTMLInputElement;
    expect(input.value).toContain("ref=abc12345");
    expect(text).toContain("3 joined");
    expect(container.querySelector('ul[aria-label="Founders on the wall"]')?.textContent).toContain("#1 Ann");
  });

  it("saves the wall opt-in and refreshes the wall", async () => {
    m.setFoundingWallOptIn.mockResolvedValue({ ...ME, wallOptIn: true });
    await renderPage();
    m.getFoundingWall.mockResolvedValue({ members: [{ number: 1, name: "Ann" }, { number: 7, name: "Fay" }] });
    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    await act(async () => { box.click(); });
    expect(m.setFoundingWallOptIn).toHaveBeenCalledWith(true);
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('ul[aria-label="Founders on the wall"]')?.textContent).toContain("#7 Fay");
  });

  it("tells a non-founder the page is for founding members and calls no founder endpoints", async () => {
    state.user = { id: "u2", email: "free@x.co", plan: "free" };
    await renderPage();
    expect(container.textContent).toContain("This page is for founding members.");
    expect(m.getFoundingMe).not.toHaveBeenCalled();
    expect(m.getFoundingWall).not.toHaveBeenCalled();
  });
});
