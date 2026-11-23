// @vitest-environment jsdom
//
// v174 phone bottom bar: Today · Projects · Create · Sync · Menu, the
// Create action sheet (quick-add task with a project picker, New
// project), active-state rules, and the Menu toggle contract with the
// sidebar (the bar only carries the button; AppSidebar owns the sheet).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@x.co", display_name: "Test User", plan: "free" }, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock("../lib/api", () => ({
  api: {
    listProjects: vi.fn(async () => ({ projects: [{ id: "p1", name: "Clinic Construction" }] })),
    createTask: vi.fn(async () => ({ id: "t1" })),
  },
}));

import { PhoneBottomBar } from "../components/PhoneBottomBar";
import { api } from "../lib/api";

let container: HTMLDivElement;
let root: Root;

async function mount(path: string, onToggleMenu = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const menuButtonRef = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <PhoneBottomBar menuOpen={false} onToggleMenu={onToggleMenu} menuButtonRef={menuButtonRef} />
      </MemoryRouter>,
    );
  });
  return onToggleMenu;
}

const items = () => [...container.querySelectorAll<HTMLElement>(".phone-bar-item")];
const itemByLabel = (label: string) => items().find((e) => e.textContent?.includes(label))!;
const sheetItem = (label: string) =>
  [...container.querySelectorAll<HTMLElement>(".phone-sheet-item")].find((e) => e.textContent?.includes(label));

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { vi.clearAllMocks(); });
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe("PhoneBottomBar", () => {
  it("renders Today, Projects, Create, Sync and Menu in order, with the right destinations", async () => {
    await mount("/app");
    expect(items().map((e) => e.textContent?.trim())).toEqual(["Today", "Projects", "+Create", "Sync", "Menu"]);
    expect(itemByLabel("Today").getAttribute("href")).toBe("/app");
    expect(itemByLabel("Projects").getAttribute("href")).toBe("/app/projects");
    expect(itemByLabel("Sync").getAttribute("href")).toBe("/app/sync");
    expect(itemByLabel("Create").tagName).toBe("BUTTON");
    expect(itemByLabel("Menu").tagName).toBe("BUTTON");
  });

  it("marks Projects active anywhere under /app/projects, and only there", async () => {
    await mount("/app/projects/p1?tab=tasks");
    expect(itemByLabel("Projects").className).toContain("active");
    expect(itemByLabel("Today").className).not.toContain("active");
    expect(itemByLabel("Sync").className).not.toContain("active");
  });

  it("marks Sync active on the sync page", async () => {
    await mount("/app/sync");
    expect(itemByLabel("Sync").className).toContain("active");
    expect(itemByLabel("Projects").className).not.toContain("active");
  });

  it("Create opens an action sheet with Quick-add task and New project, and Escape closes it", async () => {
    await mount("/app");
    expect(container.querySelector(".phone-sheet")).toBeNull();
    await act(async () => { itemByLabel("Create").click(); });
    expect(container.querySelector(".phone-sheet")).not.toBeNull();
    expect(sheetItem("Quick-add task")).toBeTruthy();
    expect(sheetItem("New project")).toBeTruthy();
    expect(sheetItem("New project")!.getAttribute("href")).toBe("/app/projects?new=1");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector(".phone-sheet")).toBeNull();
  });

  it("quick-add posts the task to the chosen project and closes the sheet", async () => {
    await mount("/app");
    await act(async () => { itemByLabel("Create").click(); });
    await act(async () => { sheetItem("Quick-add task")!.click(); });
    const input = container.querySelector<HTMLInputElement>("#phone-quickadd-title")!;
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Call the inspector");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = container.querySelector<HTMLFormElement>(".phone-quickadd")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(api.createTask).toHaveBeenCalledWith("p1", "Call the inspector", "Test User");
    expect(container.querySelector(".phone-sheet")).toBeNull();
  });

  it("the Menu button toggles the sidebar sheet through the callback", async () => {
    const onToggleMenu = await mount("/app");
    await act(async () => { itemByLabel("Menu").click(); });
    expect(onToggleMenu).toHaveBeenCalledTimes(1);
  });
});
