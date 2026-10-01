// @vitest-environment jsdom
//
// Smoke test for the other signed-in pages (Dashboard, Resource hub, What's
// New, Account, Billing) and for the "add a template to a project" drawer.
// Same idea as projectPage.smoke.test.tsx: mount the real thing, fail on any
// render or console error. Data calls stay pending (first render only), except
// where a test supplies an answer.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import Dashboard from "../pages/Dashboard";
import Resources from "../pages/Resources";
import WhatsNew from "../pages/WhatsNew";
import Account from "../pages/Account";
import Billing from "../pages/Billing";
import { ApplyTemplateDrawer } from "../components/ApplyTemplateDrawer";
import { ConfirmProvider } from "../components/ConfirmDialog";

let host: HTMLDivElement;
let root: Root;
let errors: string[];
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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
  vi.unstubAllGlobals();
});

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

function newRoot() {
  root = createRoot(host, {
    onUncaughtError: (e) => { errors.push(`uncaught: ${e instanceof Error ? e.message + "\n" + e.stack : String(e)}`); },
    onCaughtError: (e) => { errors.push(`caught: ${e instanceof Error ? e.message : String(e)}`); },
  });
}

async function mountPage(element: React.ReactNode, path = "/", routePath = "/") {
  newRoot();
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <Routes><Route path={routePath} element={element} /></Routes>
        </ConfirmProvider>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

describe("signed-in pages render without errors", () => {
  const pages: [string, () => React.ReactNode, string, string][] = [
    ["Dashboard", () => <Dashboard />, "/app", "/app"],
    ["Resource hub", () => <Resources />, "/app/resources", "/app/resources"],
    ["Resource hub at a section link", () => <Resources />, "/app/resources#how-it-works", "/app/resources"],
    ["What's new", () => <WhatsNew />, "/app/whats-new", "/app/whats-new"],
    ["Account", () => <Account />, "/app/account", "/app/account"],
    ["Billing", () => <Billing />, "/app/billing", "/app/billing"],
  ];
  for (const [name, el, path, routePath] of pages) {
    it(`${name}`, async () => {
      vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
      await mountPage(el(), path, routePath);
      expect(errors, errors.join("\n---\n")).toEqual([]);
      expect(host.textContent!.length).toBeGreaterThan(20);
    });
  }

  it("Resource hub: the Forms section and template cards are there", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await mountPage(<Resources />, "/app/resources", "/app/resources");
    expect(host.textContent).toContain("Forms & downloads");
    expect(host.textContent).toContain("Add to an existing project");
    expect(errors).toEqual([]);
  });

  it("Resource hub: the new meeting agendas and Quality / Compliance guide entries are there", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await mountPage(<Resources />, "/app/resources", "/app/resources");
    for (const name of ["Sprint planning", "Risk review", "Stage-gate / phase review", "Sponsor update", "Change control review", "Project closeout"]) {
      expect(host.textContent, name).toContain(name);
    }
    const raid = host.querySelector("#raid")!.nextElementSibling!.nextElementSibling!;
    expect(raid.textContent).toContain("Quality");
    expect(raid.textContent).toContain("Compliance");
    expect(errors).toEqual([]);
  });
});

describe("ApplyTemplateDrawer", () => {
  const summary = (add: number) => ({
    summary: {
      phases: { add: ["Plan"], skip: ["Build"] }, milestones: { add: [], skip: [] }, tasks: { add: Array.from({ length: add }, (_, i) => `Task ${i}`), skip: [] },
      risks: { add: [], skip: [] }, assumptions: { add: [], skip: [] }, stakeholders: { add: [], skip: [] }, totalToAdd: add + 1,
    },
    applied: false,
  });

  it("previews first, then writes only after the button is clicked", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/template-apply")) {
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        return json(body.preview ? summary(3) : { ...summary(3), applied: true });
      }
      return new Promise(() => {});
    }));
    const onApplied = vi.fn();
    newRoot();
    await act(async () => {
      root.render(<MemoryRouter><ApplyTemplateDrawer open onClose={() => {}} projectId="p1" templateId="software-launch" onApplied={onApplied} /></MemoryRouter>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toEqual([{ projectId: "p1", templateId: "software-launch", preview: true }]);
    expect(onApplied).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Will add");
    const addBtn = [...document.querySelectorAll("button")].find((b) => /^Add 4 items$/.test(b.textContent || ""));
    expect(addBtn, "the Add button").toBeTruthy();
    await act(async () => { addBtn!.click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(calls[1]).toEqual({ projectId: "p1", templateId: "software-launch", preview: false });
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Added 4 items");
    expect(errors).toEqual([]);
  });

  it("says there is nothing to add when the project already has it all", async () => {
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
      if (String(input).includes("/api/template-apply")) {
        return json({ summary: { ...summary(0).summary, phases: { add: [], skip: ["Plan"] }, totalToAdd: 0 }, applied: false });
      }
      return new Promise(() => {});
    }));
    newRoot();
    await act(async () => {
      root.render(<MemoryRouter><ApplyTemplateDrawer open onClose={() => {}} projectId="p1" templateId="software-launch" /></MemoryRouter>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(document.body.textContent).toContain("nothing to add");
    expect([...document.querySelectorAll("button")].some((b) => /^Add \d+ item/.test(b.textContent || ""))).toBe(false);
    expect(errors).toEqual([]);
  });
});

describe("StakeholderGrid", () => {
  it("shows people in the right boxes and lists the unplaced", async () => {
    const { StakeholderGrid } = await import("../components/StakeholderGrid");
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <StakeholderGrid
          stakeholders={[
            { id: "1", name: "Sponsor Sam", role: "Sponsor", power_level: "high", interest_level: "high" },
            { id: "2", name: "Casey", role: null, power_level: "low", interest_level: "low" },
            { id: "3", name: "Unset Una", role: null, power_level: null, interest_level: "high" },
          ]}
        />,
      );
    });
    expect(host.querySelector(".sh-quad-manage_closely")!.textContent).toContain("Sponsor Sam");
    expect(host.querySelector(".sh-quad-monitor")!.textContent).toContain("Casey");
    expect(host.querySelector(".sh-unplaced")!.textContent).toContain("Unset Una");
    await act(async () => root.unmount());
  });
});
