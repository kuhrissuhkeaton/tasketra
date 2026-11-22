// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Resources from "../pages/Resources";
import { ConfirmProvider } from "../components/ConfirmDialog";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@example.com", tour_completed_at: "2026-01-01T00:00:00Z", display_name: "Owner" },
    loading: false,
    refresh: async () => {},
    logout: async () => {},
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

// v166: the Resource hub's three doors. Sections start collapsed (their
// bodies stay mounted but hidden), open in place, open together from
// their door, open on arrival when a #section link names them, and a
// search shows its matches already open.

let host: HTMLDivElement;
let root: Root;

async function mount(path = "/app/resources") {
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
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

function section(id: string) {
  const el = host.querySelector(`#${CSS.escape(id)}`)!.closest("section")!;
  return {
    el,
    body: el.querySelector<HTMLElement>(".hub-section-body")!,
    toggle: el.querySelector<HTMLButtonElement>("button.hub-section-toggle")!,
  };
}

async function click(el: HTMLElement) {
  await act(async () => { el.click(); });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  (window.HTMLElement.prototype as any).scrollIntoView = () => {};
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

describe("Resource hub, three doors (v166)", () => {
  it("shows the three doors and every section, each with its one-line summary", async () => {
    await mount();
    const doors = [...host.querySelectorAll(".hub-door-title")].map((x) => x.textContent);
    expect(doors).toEqual(["Start", "Learn", "Reference"]);
    for (const id of ["templates", "how-it-works", "forms", "meetings", "status-reports", "methodologies", "formulas", "raid", "stakeholder-matrix"]) {
      expect(host.querySelector(`#${CSS.escape(id)}`), id).not.toBeNull();
    }
    expect(section("formulas").el.textContent).toContain("CPI, SPI, float, PERT and friends");
    expect(section("templates").el.textContent).toContain("Start a new project with phases");
  });

  it("starts every section collapsed, bodies mounted but hidden", async () => {
    await mount();
    for (const id of ["templates", "forms", "raid"]) {
      expect(section(id).body.hidden, id).toBe(true);
      expect(section(id).toggle.getAttribute("aria-expanded")).toBe("false");
    }
    // Mounted while hidden: the content is in the page (search and the
    // text-based checks still see it), just not shown.
    expect(section("raid").body.textContent).toContain("Quality");
  });

  it("opens and closes a section from its header", async () => {
    await mount();
    await click(section("raid").toggle);
    expect(section("raid").body.hidden).toBe(false);
    expect(section("raid").toggle.getAttribute("aria-expanded")).toBe("true");
    expect(section("templates").body.hidden).toBe(true);
    await click(section("raid").toggle);
    expect(section("raid").body.hidden).toBe(true);
  });

  it("a door opens all of its sections at once", async () => {
    await mount();
    const door = [...host.querySelectorAll<HTMLButtonElement>(".hub-door")]
      .find((b) => b.textContent?.includes("Reference"))!;
    await click(door);
    for (const id of ["methodologies", "formulas", "raid", "stakeholder-matrix"]) {
      expect(section(id).body.hidden, id).toBe(false);
    }
    expect(section("templates").body.hidden).toBe(true);
  });

  it("arriving at #how-it-works opens that section (the first-run footer link)", async () => {
    await mount("/app/resources#how-it-works");
    expect(section("how-it-works").body.hidden).toBe(false);
    expect(section("templates").body.hidden).toBe(true);
  });

  it("search shows its matches already open and hides the rest", async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search this page"]')!;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "earned value");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    expect(host.querySelector("#formulas")).not.toBeNull();
    expect(section("formulas").body.hidden).toBe(false);
    expect(host.querySelector("#templates")).toBeNull();
    expect(host.querySelector(".hub-doors")).toBeNull();
  });
});
