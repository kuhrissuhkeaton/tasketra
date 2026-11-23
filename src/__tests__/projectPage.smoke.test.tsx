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
import { clearApiCache } from "../lib/api";

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

async function mountProject(size: string, tab: string, extra?: (url: string) => unknown) {
  const project = projectFor(size);
  vi.stubGlobal("fetch", vi.fn((input: unknown) => {
    const url = String(input);
    if (/\/api\/project\?id=/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify({ project }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    const body = extra?.(url);
    if (body !== undefined) {
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
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
          // Keyboard users get a way past the navigation.
          expect(host.querySelector("a.skip-link")?.textContent).toBe("Skip to main content");
        });
      }
    });
  }

  it("Tasks tab: every row has the same actions: Details plus a menu holding + Sub-task and Delete", async () => {
    const task = (id: string, title: string, parent: string | null = null) => ({
      id, title, description: null, status: "not_started", owner_name: null, start_date: null,
      due_date: null, stakeholder_id: null, parent_task_id: parent, roadmap_item_id: null,
    });
    await mountProject("standard", "tasks", (url) => {
      if (/\/api\/tasks\?projectId=/.test(url)) {
        return { tasks: [task("a", "A short one"), task("b", "A much longer task title that wraps onto more than one line in a narrow column"), task("c", "Child", "b")] };
      }
      if (/\/api\/raid-task-links/.test(url)) return { riskLinks: [], issueLinks: [] };
      if (/\/api\/task-dependencies/.test(url)) return { links: [] };
      if (/\/api\/roadmap\?/.test(url)) return { items: [] };
      return undefined;
    });
    expect(errors, errors.join("\n---\n")).toEqual([]);
    const rows = [...host.querySelectorAll("li.rg-row")];
    expect(rows.length).toBe(3);
    for (const r of rows) {
      const actions = r.querySelector(".rg-actions");
      expect(actions?.textContent).toContain("Details");
      // + Sub-task and Delete live in the row's "..." menu.
      const menuBtn = actions?.querySelector<HTMLButtonElement>("button.row-menu-btn");
      expect(menuBtn?.getAttribute("aria-label")).toMatch(/^More actions for /);
      await act(async () => menuBtn!.click());
      const labels = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);
      expect(labels).toEqual(["+ Sub-task", "Delete"]);
      await act(async () => menuBtn!.click());
      // The old floating "+" next to the title is gone.
      expect(r.querySelector(".wbs-add-btn")).toBeNull();
    }
  });

  it("Tasks tab: grouped by due date, with a late flag in its own column, a Sort control, and Board still one click away", async () => {
    const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
    const task = (id: string, title: string, due: string | null, status = "not_started") => ({
      id, title, description: null, status, owner_name: null, start_date: null,
      due_date: due, stakeholder_id: null, parent_task_id: null, roadmap_item_id: null,
    });
    await mountProject("standard", "tasks", (url) => {
      if (/\/api\/tasks\?projectId=/.test(url)) {
        return { tasks: [task("a", "Late one", d(-3)), task("b", "Soon one", d(2)), task("c", "Far one", d(40)), task("e", "Finished", d(-9), "done")] };
      }
      if (/\/api\/raid-task-links/.test(url)) return { riskLinks: [], issueLinks: [] };
      if (/\/api\/task-dependencies/.test(url)) return { links: [] };
      if (/\/api\/roadmap\?/.test(url)) return { items: [] };
      return undefined;
    });
    expect(errors, errors.join("\n---\n")).toEqual([]);
    const heads = [...host.querySelectorAll("summary.rg-group-head h2")].map((h) => h.textContent);
    expect(heads).toEqual(["Overdue", "Next 7 days", "Later", "Done"]);
    const open = [...host.querySelectorAll("details.rg-group")].map((x) => (x as HTMLDetailsElement).open);
    // v173 (P0-5): all groups start open -- the tab shows its tasks on arrival.
    expect(open).toEqual([true, true, true, true]);
    const late = host.querySelector('details.rg-group li.rg-row [data-slot="flag"]');
    expect(late?.textContent).toBe("3 days late");
    expect(host.querySelector('select[aria-label="Sort tasks by"]')).not.toBeNull();
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Board")).toBe(true);
  });

  it("the skip link moves focus to the main content", async () => {
    await mountProject("standard", "charter");
    const link = host.querySelector("a.skip-link") as HTMLAnchorElement;
    await act(async () => link.click());
    expect(document.activeElement?.tagName).toBe("MAIN");
  });

  it("the phone Menu button opens and closes the navigation, and Escape closes it", async () => {
    await mountProject("standard", "charter");
    // v174: the Menu button lives in the phone bottom bar; the old
    // in-header .sidebar-menu-btn retired with the tab bar.
    const btn = [...host.querySelectorAll<HTMLButtonElement>(".phone-bar-item")].find((b) => b.textContent?.includes("Menu"))!;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".sidebar-open")).toBeNull();
    await act(async () => btn.click());
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector(".sidebar-open")).not.toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector(".sidebar-open")).toBeNull();
  });

  it("Stakeholders tab with data: list shows each person's power, grid view places people", async () => {
    await mountProject("standard", "stakeholders", (url) =>
      /\/api\/stakeholders\?projectId=/.test(url)
        ? { stakeholders: [
            { id: "s1", name: "Sponsor Sam", email: null, role: "Sponsor", phone: null, power_level: "high", interest_level: "high", preferred_contact: null, notes: null },
            { id: "s2", name: "Unset Una", email: null, role: null, phone: null, power_level: null, interest_level: null, preferred_contact: null, notes: null },
          ] }
        : undefined);
    expect(host.textContent).toContain("Sponsor Sam");
    expect([...host.querySelectorAll("li.rg-row [data-slot=\"pill\"]")].map((t) => t.textContent)).toContain("High power");
    const gridBtn = [...host.querySelectorAll("button")].find((b) => b.textContent === "Power / interest grid")!;
    await act(async () => { gridBtn.click(); });
    expect(host.querySelector(".sh-quad-manage_closely")!.textContent).toContain("Sponsor Sam");
    expect(host.querySelector(".sh-unplaced")!.textContent).toContain("Unset Una");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });

  it("table-heavy tabs get the wider column, prose tabs keep the narrow one", async () => {
    await mountProject("standard", "procurement");
    expect(host.querySelector("main.project-main")!.classList.contains("project-main-tables")).toBe(true);
    await act(async () => { root.unmount(); });
    host.innerHTML = "";
    await mountProject("standard", "charter");
    expect(host.querySelector("main.project-main")!.classList.contains("project-main-tables")).toBe(false);
  });

  it("RACI tab with data: task rows sit under their phase, with a picker for more", async () => {
    await mountProject("standard", "raci", (url) => {
      if (/\/api\/raci\?projectId=/.test(url)) {
        return {
          rows: [
            { id: "ph1", type: "phase", title: "Plan", start_date: null, end_date: null },
            { id: "t1", type: "task", title: "Write the plan", start_date: null, end_date: null, phaseId: "ph1" },
            { id: "t2", type: "task", title: "Loose task", start_date: null, end_date: null, phaseId: null },
          ],
          people: [{ key: "s:a", kind: "stakeholder", name: "Sponsor Sam", role: "Sponsor" }],
          assignments: [{ itemId: "t1", personKey: "s:a", role: "A" }],
        };
      }
      if (/\/api\/tasks\?projectId=/.test(url)) {
        return { tasks: [{ id: "t1", title: "Write the plan" }, { id: "t3", title: "Spare task", status: "done" }] };
      }
      return undefined;
    });
    const text = host.textContent!;
    expect(text).toContain("Write the plan");
    expect(text).toContain("Other tasks");
    expect(text).toContain("Phase / milestone / task");
    expect(host.querySelectorAll(".raci-row-task")).toHaveLength(2);
    const options = [...host.querySelectorAll("#raci-add-task option")].map((o) => o.textContent);
    expect(options).toContain("Spare task (done)");
    expect(options).not.toContain("Write the plan");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });

  it("shows every section in the sidebar, grouped, when all tabs are shown (v174 order)", async () => {
    await mountProject("full", "issues");
    // Project items carry the tour's data-tour="tab-*" ids. v174
    // regrouped them by job (Plan / Track / People / Wrap up + a settings
    // tail), renamed the jargon labels plain-word-first, and made Client
    // Snapshot and Trash regular entries: 26 tabs plus the snapshot link.
    const items = [...host.querySelectorAll(".side-nav .side-tab[data-tour^='tab-']")].map((b) =>
      (b.textContent ?? "").replace(/\d+$/, ""),
    );
    expect(items).toEqual([
      "Overview",
      "Roadmap", "Charter", "Budget", "Meetings", "Goals (OKRs)",
      "Tasks", "Issues", "Risks", "Assumptions", "Dependencies", "Quality", "Compliance",
      "Stakeholders", "Decisions", "Roles (RACI)", "Vendors", "Communication plan",
      "Documents", "Status report", "Client Snapshot", "Closure", "Saved templates", "Export", "Trash",
      "Project settings", "Webhooks",
    ]);
    expect(host.querySelector(".side-nav .side-tab.active")?.getAttribute("data-tour")).toBe("tab-issues");
    const labels = [...host.querySelectorAll(".side-nav-label")].map((b) => (b.textContent ?? "").replace(/▾$/, ""));
    expect(labels).toEqual(expect.arrayContaining(["Plan", "Track", "People", "Wrap up"]));
  });

  it("the sidebar lists the project tabs under the project name (v172)", async () => {
    await mountProject("full", "home");
    expect(host.querySelectorAll(".side-nav .side-tab[data-tour^='tab-']").length).toBeGreaterThan(0);
  });

  it("decision cards lead with the wait, and Nudge copies a ready reminder (v160, F-16)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    await mountProject("full", "decisions", (url) => {
      if (/\/api\/decisions\?projectId=/.test(url)) {
        return {
          decisions: [
            {
              id: "d1", title: "Approve the charter", context: "", options: ["Approve", "Reject"],
              status: "open", deadline: "2026-12-04", created_at: fiveDaysAgo, public_token: "tok123",
              recipients: [{ id: "s1", name: "Sponsor (VP Customer Success)" }], records: [],
            },
            {
              id: "d2", title: "Pick the venue", context: "", options: ["A", "B"],
              status: "open", deadline: null, created_at: fiveDaysAgo, public_token: "tok456",
              recipients: [], records: [],
            },
          ],
        };
      }
      if (/\/api\/stakeholders\?projectId=/.test(url)) return { stakeholders: [] };
      return undefined;
    });
    const cards = [...host.querySelectorAll(".decision-card")];
    expect(cards).toHaveLength(2);
    const wait = cards[0].querySelector(".decision-wait")?.textContent ?? "";
    expect(wait).toContain("Waiting on");
    expect(wait).toContain("Sponsor (VP Customer Success)");
    expect(wait).toContain("waiting 5 days");
    expect(wait).toContain("Needed by");
    expect(host.textContent).not.toContain("Asked:");
    // Copy link is the primary button; Nudge sits beside it.
    const actions = cards[0].querySelector(".decision-actions")!;
    expect(actions.querySelector(".btn-primary")?.textContent).toBe("Copy link");
    const nudge = [...actions.querySelectorAll("button")].find((b) => b.textContent === "Nudge")!;
    expect(nudge).toBeTruthy();
    await act(async () => { nudge.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('a quick nudge on "Approve the charter"');
    expect(copied).toContain("waiting 5 days");
    expect(copied).toContain("/d/tok123");
    expect(nudge.textContent).toBe("Nudge copied");
    // The unsent decision says so in its lead line and offers no Nudge.
    expect(cards[1].querySelector(".decision-wait")?.textContent).toContain("Not sent to anyone yet");
    expect(cards[1].querySelector(".decision-actions")?.textContent).not.toContain("Nudge");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });

  it("decided requests drop into a collapsed Decided group below the waiting ones (v172)", async () => {
    clearApiCache();
    const now = new Date().toISOString();
    await mountProject("full", "decisions", (url) => {
      if (/\/api\/decisions\?projectId=/.test(url)) {
        return {
          decisions: [
            {
              id: "d1", title: "Approve the charter", context: "", options: ["Approve", "Reject"],
              status: "open", deadline: null, created_at: now, public_token: "tok123",
              recipients: [], records: [],
            },
            {
              id: "d2", title: "Pick the venue", context: "", options: ["A", "B"],
              status: "decided", deadline: null, created_at: now, public_token: "tok456",
              recipients: [], records: [], chosen_option: "A", responder_name: "Sponsor Sam",
              responded_at: now, outcome_confirmed_at: null,
            },
          ],
        };
      }
      if (/\/api\/stakeholders\?projectId=/.test(url)) return { stakeholders: [] };
      return undefined;
    });
    // Only the waiting card renders; the decided one waits behind the group.
    const cards = [...host.querySelectorAll(".decision-card")];
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Approve the charter");
    const toggle = host.querySelector<HTMLButtonElement>("button.layer-group-btn")!;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toContain("Decided");
    await act(async () => { toggle.click(); });
    const all = [...host.querySelectorAll(".decision-card")];
    expect(all).toHaveLength(2);
    expect(all[1].textContent).toContain("Pick the venue");
    expect(all[1].textContent).toContain("Decided:");
    expect(errors, errors.join("\n---\n")).toEqual([]);
  });
});
