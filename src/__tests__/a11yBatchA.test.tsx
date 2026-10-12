// @vitest-environment jsdom
//
// Batch A (accessibility only): page titles, landmarks and headings on the
// sign-in and public pages, and keyboard access to scrolling regions.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useRef } from "react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: async () => {}, logout: async () => {} }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

import Login from "../pages/Login";
import ForgotPassword from "../pages/ForgotPassword";
import ResetPassword from "../pages/ResetPassword";
import { useDocumentTitle } from "../lib/documentTitle";
import { useIsScrollable } from "../lib/scrollRegion";
import { ResizableTable } from "../components/ResizableTable";

let container: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  document.title = "Tasketra -- Project Management for Project Managers";
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount(ui: React.ReactElement, url = "/") {
  act(() => { root.render(<MemoryRouter key={url} initialEntries={[url]}>{ui}</MemoryRouter>); });
}

describe("page titles", () => {
  function Page({ title }: { title: string | null }) { useDocumentTitle(title); return <p>hi</p>; }

  it("names the page, and puts the default back when it goes away", () => {
    mount(<Page title="Billing" />);
    expect(document.title).toBe("Billing | Tasketra");
    act(() => root.render(<p>elsewhere</p>));
    expect(document.title).toBe("Tasketra -- Project Management for Project Managers");
  });

  it("follows a title that changes, and leaves the default alone when there is none yet", () => {
    mount(<Page title={null} />);
    expect(document.title).toBe("Tasketra -- Project Management for Project Managers");
    mount(<Page title="Tasks | Alpha" />);
    expect(document.title).toBe("Tasks | Alpha | Tasketra");
  });

  it("is set by the sign-in page for each mode", () => {
    mount(<Login />);
    expect(document.title).toBe("Sign in | Tasketra");
    mount(<Login />, "/login?mode=register");
    expect(document.title).toBe("Create your account | Tasketra");
  });
});

describe("landmarks and headings on the sign-in pages", () => {
  const cases: [string, React.ReactElement, string][] = [
    ["sign in", <Login />, "/login"],
    ["create account", <Login />, "/login?mode=register"],
    ["forgot password", <ForgotPassword />, "/forgot-password"],
    ["reset password", <ResetPassword />, "/reset-password?token=abc"],
    ["reset link missing", <ResetPassword />, "/reset-password"],
  ];
  it.each(cases)("%s has one <main> and one <h1>", (_n, ui, url) => {
    mount(ui, url);
    expect(container.querySelectorAll("main").length).toBe(1);
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.querySelector("main h1")?.textContent?.trim()).toBeTruthy();
  });
});

describe("scrolling regions are reachable from the keyboard only while they scroll", () => {
  function Box({ wide }: { wide: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const scrolls = useIsScrollable(ref);
    return <div ref={ref} data-testid="box" data-wide={String(wide)} {...(scrolls ? { tabIndex: 0 } : {})}><span /></div>;
  }

  function sizeIt(wide: boolean) {
    const proto = HTMLElement.prototype;
    Object.defineProperty(proto, "scrollWidth", { configurable: true, get: () => (wide ? 900 : 300) });
    Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => 300 });
    Object.defineProperty(proto, "scrollHeight", { configurable: true, get: () => 100 });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => 100 });
  }
  afterEach(() => {
    for (const k of ["scrollWidth", "clientWidth", "scrollHeight", "clientHeight"]) delete (HTMLElement.prototype as any)[k];
  });

  it("adds a tab stop when the content is wider than the box", () => {
    sizeIt(true);
    mount(<Box wide />);
    expect(container.querySelector("[data-testid=box]")?.getAttribute("tabindex")).toBe("0");
  });

  it("adds none when everything fits", () => {
    sizeIt(false);
    mount(<Box wide={false} />);
    expect(container.querySelector("[data-testid=box]")?.hasAttribute("tabindex")).toBe(false);
  });

  it("a wide ResizableTable becomes a named, focusable region; every column header gets a scope", () => {
    sizeIt(true);
    // jsdom has no layout, so give text ranges a size.
    (Range.prototype as any).getBoundingClientRect = () => ({ width: 50, height: 10, top: 0, left: 0, right: 50, bottom: 10 });
    (Range.prototype as any).getClientRects = () => [];
    mount(
      <ResizableTable id="risk-register">
        <thead><tr><th>Risk</th><th aria-label="Actions"></th></tr></thead>
        <tbody><tr><td>A</td><td /></tr></tbody>
      </ResizableTable>,
    );
    const wrap = container.querySelector(".resizable-table-wrap")!;
    expect(wrap.getAttribute("tabindex")).toBe("0");
    expect(wrap.getAttribute("role")).toBe("region");
    expect(wrap.getAttribute("aria-label")).toBe("risk register table, scrollable");
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("risk register table");
    container.querySelectorAll("th").forEach((th) => expect(th.getAttribute("scope")).toBe("col"));
  });
});
