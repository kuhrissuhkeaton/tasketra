// @vitest-environment jsdom
//
// Smoke test for the real project page. It mounts the actual ProjectHome with
// its real sidebar, header and tab content, for every tab and for Light,
// Standard and Full projects, and fails on any render error or console error.
//
// Why it exists: v87 added a RACI tab with no sidebar icon. Every project page
// crashed, but tsc, lint and the new feature's own tests all passed because
// nothing mounted the page the feature plugs into.
//
// What it does NOT cover: data-dependent states. Every API call except the
// project itself stays pending, so tabs show their first (loading) render.
// That is the state where shell and navigation bugs show up. Per-tab logic
// is covered by the integration tests.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import homeSource from "../pages/ProjectHome.tsx?raw";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import ProjectHome from "../pages/ProjectHome";
import { ConfirmProvider } from "../components/ConfirmDialog";

// Every tab id, read from the Tab type so a new tab is picked up automatically.
const TAB_IDS: string[] = (() => {
  const m = homeSource.match(/export type Tab =([^;]+);/);
  if (!m) throw new Error("Could not find the Tab type in ProjectHome.tsx");
  return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
})();

const SIZES = ["light", "standard", "full"] as const;

function projectFor(size: string) {
  return {
    id: "p1", name: "Smoke Test Project", description: "A project", is_owner: true,
    size, approach: "hybrid", show_all_tabs: true, stage: "plan",
    created_at: "2026-09-01T00:00:00Z",
  };
}

let host: HTMLDivElement;
let root: Root;
let errors: string[];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom lacks these; the app uses them for layout and scrolling.
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // jsdom has no layout, so Range measuring (used by ResizableTable) needs a stub
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = (() => {}) as any;
});

beforeEach(() => {
  errors = [];
  consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(" "));
  });
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host.remove();
  consoleError.mockRestore();
  vi.restoreAllMocks();
});

async function mountProject(size: string, tab: string) {
  const project = projectFor(size);
  vi.stubGlobal("fetch", vi.fn((input: unknown) => {
    const url = String(input);
    if (/\/api\/project\?id=/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify({ project }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return new Promise(() => {}); // everything else stays loading
  }));
  root = createRoot(host, {
    onUncaughtError: (e) => { errors.push(`uncaught: ${e instanceof Error ? e.message + "\n" + e.stack : String(e)}`); },
    onCaughtError: (e) => { errors.push(`caught: ${e instanceof Error ? e.message : String(e)}`); },
  });
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/app/projects/p1?tab=${tab}`]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/app/projects/:id" element={<ProjectHome />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>
    );
  });
  // Let the project fetch resolve and the page re-render with it.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("project page smoke test", () => {
  it("finds the tab list", () => {
    expect(TAB_IDS.length).toBeGreaterThan(20);
    expect(TAB_IDS).toContain("raci");
  });

  for (const size of SIZES) {
    describe(`${size} project`, () => {
      for (const tab of TAB_IDS) {
        it(`renders the ${tab} tab without errors`, async () => {
          await mountProject(size, tab);
          expect(errors, errors.join("\n---\n")).toEqual([]);
          expect(host.textContent).toContain("Smoke Test Project");
          // The sidebar rendered with at least the Reference group.
          expect(host.querySelectorAll(".side-tab").length).toBeGreaterThan(3);
        });
      }
    });
  }

  it("shows every sidebar tab with its icon when all tabs are shown", async () => {
    await mountProject("full", "home");
    const buttons = [...host.querySelectorAll(".side-tab[data-tour]")];
    expect(buttons.length).toBeGreaterThan(15);
    for (const b of buttons) {
      expect(b.querySelector("svg"), `no icon on "${b.textContent}"`).not.toBeNull();
      expect(b.querySelector("svg")!.children.length, `empty icon on "${b.textContent}"`).toBeGreaterThan(0);
    }
    expect(buttons.map((b) => b.textContent)).toContain("RACI");
  });
});
