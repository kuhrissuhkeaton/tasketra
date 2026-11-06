// @vitest-environment jsdom
//
// The admin support-view pages (v149): the per-user project list and the
// read-only project snapshot. Mounts the real pages with the api answered
// by stubs.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u-admin", email: "admin@example.com", isAdmin: true, tour_completed_at: "2026-01-01T00:00:00Z" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

const calls = {
  listProjects: vi.fn(),
  snapshot: vi.fn(),
};

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      adminListUserProjects: (userId: string) => calls.listProjects(userId),
      adminGetProjectSnapshot: (projectId: string) => calls.snapshot(projectId),
    },
  };
});

import { AdminUserProjects, AdminProjectView } from "../pages/AdminProjectView";

const SNAPSHOT = {
  readOnly: true,
  project: {
    id: "p-1", name: "Kitchen Reno", description: "Redo the kitchen", created_at: "2026-10-01T00:00:00Z",
    owner_id: "u-owner", archived: false, stage: "execute", size: null, approach: null, closed_at: null,
    owner_email: "owner@example.com", owner_display_name: "Olivia Owner", last_activity_at: "2026-11-01T00:00:00Z",
  },
  members: [{ id: "m-1", email: "helper@example.com", status: "active", invited_at: "2026-10-02T00:00:00Z", joined_at: "2026-10-02T00:00:00Z", is_ccb_reviewer: false }],
  stakeholders: [{ id: "s-1", name: "Sam Stakeholder", email: null, role: "Sponsor", phone: null, power_level: "high", interest_level: "high", preferred_contact: null, notes: null }],
  tasks: [{ id: "t-1", title: "Hang cabinets", description: null, status: "in_progress", owner_name: "Sam", start_date: null, due_date: "2026-11-10", stakeholder_id: null, parent_task_id: null, roadmap_item_id: null, priority: "high", created_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-04T00:00:00Z" }],
  taskLinks: [],
  roadmapItems: [],
  decisions: [{ id: "d-1", title: "Countertop material", context: null, options: ["Wood", "Stone"], deadline: null, status: "open", created_at: "2026-10-05T00:00:00Z", chosen_option: null, responder_name: null, responded_at: null, recipients: [{ id: "s-1", name: "Sam Stakeholder" }] }],
  risks: [],
  issues: [],
  assumptions: [],
  statusUpdates: [{ id: "u-1", body: "Kicked off", health: "on_track", created_at: "2026-10-06T00:00:00Z" }],
  documents: [{ id: "doc-1", filename: "plan.pdf", mime_type: "application/pdf", size_bytes: 2048, created_at: "2026-10-07T00:00:00Z", uploaded_by_email: "owner@example.com", previewable: true }],
  activity: [{ id: "a-1", entity_type: "task", entity_id: "t-1", entity_title: "Hang cabinets", action: "created", summary: "Created task Hang cabinets", actor_id: "u-owner", created_at: "2026-10-03T00:00:00Z" }],
};

const EMPTY_SNAPSHOT = {
  ...SNAPSHOT,
  project: { ...SNAPSHOT.project, id: "p-2", name: "My first project", last_activity_at: null },
  members: [], stakeholders: [], tasks: [], decisions: [], statusUpdates: [], documents: [], activity: [],
};

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const zero = { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
  (Range.prototype as any).getBoundingClientRect = () => zero;
  (Range.prototype as any).getClientRects = () => [];
  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  calls.listProjects.mockReset();
  calls.snapshot.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
});

async function render(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/support/:userId" element={<AdminUserProjects />} />
          <Route path="/admin/support/project/:projectId" element={<AdminProjectView />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await act(async () => {});
}

describe("Admin support view", () => {
  it("lists the user's projects with counts and links into the viewer", async () => {
    calls.listProjects.mockResolvedValue({
      owner: { id: "u-owner", email: "owner@example.com", display_name: "Olivia Owner" },
      projects: [{ id: "p-1", name: "Kitchen Reno", description: null, stage: "execute", archived: false, created_at: "2026-10-01T00:00:00Z", last_activity_at: "2026-11-01T00:00:00Z", task_count: 4, open_decisions: 1, document_count: 2 }],
    });
    await render("/admin/support/u-owner");
    expect(calls.listProjects).toHaveBeenCalledWith("u-owner");
    expect(host.textContent).toContain("owner@example.com");
    expect(host.textContent).toContain("Kitchen Reno");
    expect(host.textContent).toContain("4 tasks");
    const link = Array.from(host.querySelectorAll("a")).find((a) => a.textContent === "Kitchen Reno");
    expect(link?.getAttribute("href")).toBe("/admin/support/project/p-1");
  });

  it("renders the snapshot with the read-only banner naming the owner", async () => {
    calls.snapshot.mockResolvedValue(SNAPSHOT);
    await render("/admin/support/project/p-1");
    expect(calls.snapshot).toHaveBeenCalledWith("p-1");
    expect(host.textContent).toContain("Support view");
    expect(host.textContent).toContain("Olivia Owner (owner@example.com)");
    expect(host.textContent).toContain("read-only. This view is logged.");
    expect(host.textContent).toContain("Hang cabinets");
    expect(host.textContent).toContain("Countertop material");
    expect(host.textContent).toContain("Kicked off");
    expect(host.textContent).toContain("Created task Hang cabinets");
    const docLink = Array.from(host.querySelectorAll("a")).find((a) => a.textContent === "plan.pdf");
    expect(docLink?.getAttribute("href")).toContain("/admin-project-view?projectId=p-1&documentId=doc-1");
    // No mutation controls anywhere in the page's main content (the sidebar
    // has its own navigation buttons; the support view itself has none).
    const main = host.querySelector("main")!;
    expect(main.querySelectorAll("button").length).toBe(0);
    expect(main.querySelectorAll("input, textarea, select").length).toBe(0);
  });

  it("makes an empty project obviously empty", async () => {
    calls.snapshot.mockResolvedValue(EMPTY_SNAPSHOT);
    await render("/admin/support/project/p-2");
    expect(host.textContent).toContain("This project is empty");
    expect(host.textContent).toContain("No tasks yet.");
  });
});
