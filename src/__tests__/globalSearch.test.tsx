// @vitest-environment jsdom
//
// Global search palette (v159, F-18): opens from the sidebar trigger and
// Cmd/Ctrl-K, groups /api/search results by type, and Enter follows the
// active result to the tab where it lives.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "karissa@x.co", display_name: "Karissa Keaton", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const m = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});

import { GlobalSearch } from "../components/GlobalSearch";

function Where() {
  const loc = useLocation();
  return <div data-where={`${loc.pathname}${loc.search}`} />;
}

let container: HTMLDivElement; let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  m.search.mockReset();
  m.search.mockResolvedValue({
    projects: [{ id: "p1", name: "Portal Launch" }],
    tasks: [{ id: "t1", title: "Wire the SSO flow", projectId: "p1", projectName: "Portal Launch" }],
    decisions: [],
    risks: [{ id: "r1", title: "SSO approval slips", projectId: "p1", projectName: "Portal Launch" }],
  });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function mount() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes><Route path="*" element={<><GlobalSearch /><Where /></>} /></Routes>
      </MemoryRouter>,
    );
  });
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // The palette debounces the fetch by 180ms.
  await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
}

function key(input: HTMLInputElement, k: string) {
  return act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}

describe("GlobalSearch", () => {
  it("opens on Cmd-K, groups results by type, and Enter opens the active one", async () => {
    await mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }));
    });
    const input = container.querySelector<HTMLInputElement>(".search-input") ?? document.querySelector<HTMLInputElement>(".search-input");
    expect(input).toBeTruthy();
    await type(input!, "sso");
    expect(m.search).toHaveBeenCalledWith("sso");
    const panel = document.querySelector(".search-panel")!;
    const groups = [...panel.querySelectorAll(".search-group-title")].map((g) => g.textContent);
    expect(groups).toEqual(["Projects", "Tasks", "Risks"]);
    expect(panel.textContent).toContain("Wire the SSO flow");
    expect(panel.textContent).toContain("Portal Launch");
    await key(input!, "ArrowDown");
    await key(input!, "ArrowDown");
    await key(input!, "Enter");
    expect(container.querySelector("[data-where]")?.getAttribute("data-where")).toBe("/app/projects/p1?tab=tasks");
  });

  it("shows the hint below two characters and the empty state when nothing matches", async () => {
    await mount();
    const trigger = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Search"))!;
    await act(async () => { trigger.click(); });
    const input = document.querySelector<HTMLInputElement>(".search-input")!;
    expect(document.querySelector(".search-panel")?.textContent).toContain("at least two characters");
    m.search.mockResolvedValue({ projects: [], tasks: [], decisions: [], risks: [] });
    await type(input, "zzz");
    expect(document.querySelector(".search-panel")?.textContent).toContain("Nothing matches");
  });

  it("Escape closes the palette", async () => {
    await mount();
    const trigger = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Search"))!;
    await act(async () => { trigger.click(); });
    expect(document.querySelector(".search-panel")).toBeTruthy();
    const input = document.querySelector<HTMLInputElement>(".search-input")!;
    await key(input, "Escape");
    expect(document.querySelector(".search-panel")).toBeNull();
  });
});
