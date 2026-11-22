// @vitest-environment jsdom
//
// v172 Learn: the article data every surface links to, the article
// page (?article=<slug>) with its In-your-project card, and the hub's
// Start here path + guide shelves.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const m = vi.hoisted(() => ({ listProjects: vi.fn() }));
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, ...m } };
});
vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import Resources from "../pages/Resources";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { LEARN_ARTICLES, articleBySlug } from "../lib/learnArticles";

let host: HTMLDivElement;
let root: Root;

async function mount(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ConfirmProvider>
          <Routes>
            <Route path="/app/resources" element={<Resources />} />
          </Routes>
        </ConfirmProvider>
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

beforeEach(() => {
  m.listProjects.mockReset();
  m.listProjects.mockResolvedValue({ projects: [{ id: "p1", name: "Clinic" }] });
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  (window.HTMLElement.prototype as any).scrollIntoView = () => {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("Learn articles data", () => {
  it("covers every slug the app's surfaces link to, with real bodies", () => {
    const expected = [
      "risks", "issues", "assumptions", "dependencies", "quality", "compliance",
      "budget", "vendors", "documents", "stakeholders", "decisions", "meetings",
      "comms", "change-requests", "lessons", "okrs",
    ];
    expect(LEARN_ARTICLES.map((a) => a.slug).sort()).toEqual([...expected].sort());
    expect(new Set(LEARN_ARTICLES.map((a) => a.slug)).size).toBe(LEARN_ARTICLES.length);
    for (const a of LEARN_ARTICLES) {
      expect(a.body.length, a.slug).toBeGreaterThanOrEqual(2);
      expect(a.tab, a.slug).toBeTruthy();
      expect(articleBySlug(a.slug)?.title).toBe(a.title);
    }
    expect(articleBySlug("nope")).toBeNull();
  });
});

describe("Learn article page", () => {
  it("renders the article with its In-your-project card", async () => {
    await mount("/app/resources?article=risks");
    expect(host.textContent).toContain("How risks work");
    expect(host.textContent).toContain("written down before it does");
    expect(host.textContent).toContain("In your project");
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent === "Open Risks") as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/app/projects/p1?tab=risks");
    // The hub doors are not on the article page.
    expect(host.querySelector(".hub-doors")).toBeNull();
  });

  it("an unknown slug falls back to the hub", async () => {
    await mount("/app/resources?article=nope");
    expect(host.querySelector(".hub-doors")).not.toBeNull();
    expect(host.textContent).toContain("Start here");
  });

  it("the hub carries the guide shelves and the Start here path", async () => {
    await mount("/app/resources");
    expect(host.querySelector("#guides")).not.toBeNull();
    expect(host.querySelector("#register-guides")).not.toBeNull();
    expect(host.querySelector(".learn-path")).not.toBeNull();
    expect([...host.querySelectorAll(".hub-door-title")].map((x) => x.textContent)).toEqual(["Start", "Learn", "Reference"]);
  });
});
