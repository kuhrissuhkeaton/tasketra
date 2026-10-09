// @vitest-environment jsdom
//
// QuickAddJump: the phone/tablet "jump to the form" button on the register entry forms.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { QuickAddForm } from "../components/QuickAddForm";
import { wouldCover } from "../components/QuickAddJump";

let host: HTMLDivElement;
let root: Root;
const submitted = vi.fn();
let narrow = true;
let ioCallback: ((entries: any[]) => void) | null = null;

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  submitted.mockReset();
  ioCallback = null;
  narrow = true;
  (window as any).innerHeight = 800;
  window.matchMedia = ((q: string) => ({ matches: /860/.test(q) ? narrow : false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any;
  (globalThis as any).IntersectionObserver = class { constructor(cb: any) { ioCallback = cb; } observe() {} unobserve() {} disconnect() {} };
  (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.innerHTML = ""; vi.useRealTimers(); });

function Demo() {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <QuickAddForm
      storageKey="jump"
      hasRows
      onSubmit={(e) => { e.preventDefault(); submitted({ title, notes }); }}
      quick={<><input aria-label="Title" className="quick-add-title" value={title} onChange={(e) => setTitle(e.target.value)} /><button className="btn btn-primary">Log risk</button></>}
      more={<textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />}
    />
  );
}
const pill = () => document.querySelector<HTMLButtonElement>('.quick-add-jump:not([data-clear="false"])');
const anyPill = () => document.querySelector<HTMLButtonElement>(".quick-add-jump");
const scrolledPast = (past = true) => act(() => { ioCallback!([{ isIntersecting: !past, boundingClientRect: { bottom: past ? -40 : 300, top: past ? -200 : 100 } }]); });
const settle = () => act(() => { vi.advanceTimersByTime(600); });
const setY = (y: number) => { Object.defineProperty(window, "scrollY", { value: y, configurable: true }); window.dispatchEvent(new Event("scroll")); };
async function mount() { await act(async () => { root.render(<Demo />); }); }

describe("QuickAddJump", () => {
  it("is absent until the form has scrolled completely out of view", async () => {
    await mount();
    expect(pill()).toBeNull();
    scrolledPast(false);
    expect(pill()).toBeNull();
    scrolledPast(true);
    expect(pill()).not.toBeNull();
  });

  it("is not shown when the form is below the viewport (not scrolled past)", async () => {
    await mount();
    act(() => { ioCallback!([{ isIntersecting: false, boundingClientRect: { bottom: 900, top: 800 } }]); });
    expect(pill()).toBeNull();
  });

  it("is never shown above 860px", async () => {
    narrow = false;
    await mount();
    expect(ioCallback).toBeNull();
    expect(pill()).toBeNull();
  });

  it("is hidden on short screens (landscape phones)", async () => {
    (window as any).innerHeight = 375;
    await mount();
    scrolledPast();
    expect(pill()).toBeNull();
  });

  it("shows the register's own label with a plus, and an accessible name that says it jumps to the form", async () => {
    await mount();
    scrolledPast();
    expect(pill()!.textContent).toBe("+ Log risk");
    expect(pill()!.getAttribute("aria-label")).toBe("Jump to the form to log risk");
  });

  it("hides while scrolling down and returns after scrolling stops", async () => {
    await mount();
    scrolledPast();
    act(() => setY(100));
    act(() => setY(160));
    expect(pill()).toBeNull();
    settle();
    expect(pill()).not.toBeNull();
  });

  it("scrolling up does not hide it", async () => {
    await mount();
    scrolledPast();
    act(() => setY(500));
    settle();
    act(() => setY(400));
    expect(pill()).not.toBeNull();
  });

  it("is hidden while a dialog, alert dialog, menu or open Project tools menu is on screen", async () => {
    await mount();
    scrolledPast();
    for (const html of ['<div role="dialog"></div>', '<div role="alertdialog" aria-modal="true"></div>', '<div role="menu"></div>', '<div class="sidebar sidebar-open"></div>']) {
      const el = document.createElement("div");
      el.innerHTML = html;
      document.body.appendChild(el);
      await act(async () => { await Promise.resolve(); });
      expect(pill(), html).toBeNull();
      el.remove();
      await act(async () => { await Promise.resolve(); });
      expect(pill(), `after ${html}`).not.toBeNull();
    }
  });

  it("is hidden while a text field or select has focus, but not for a button or checkbox", async () => {
    await mount();
    scrolledPast();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    act(() => input.focus());
    expect(pill()).toBeNull();
    act(() => input.blur());
    expect(pill()).not.toBeNull();
    const cb = document.createElement("input"); cb.type = "checkbox"; document.body.appendChild(cb);
    act(() => cb.focus());
    expect(pill()).not.toBeNull();
  });

  it("tap scrolls to the form and focuses the first field without submitting, clearing or expanding anything", async () => {
    await mount();
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    const toggle = host.querySelector<HTMLButtonElement>(".quick-add-toggle")!;
    scrolledPast();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(input, "half typed"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => input.blur());
    await act(async () => { pill()!.click(); });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("half typed");
    expect(submitted).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Focus is in a text field now, so the button steps aside.
    expect(pill()).toBeNull();
  });
});

describe("QuickAddJump never covers a control and never moves", () => {
  const box = (left: number, right: number, top = 600, bottom = 650) => ({ left, right, top, bottom });
  const pillBox = { width: 100, height: 44, top: 607 };

  it("wouldCover is false when nothing is under the bottom-right spot", () => {
    expect(wouldCover(pillBox, 375, [box(10, 100, 100, 150), box(10, 200)])).toBe(false);
  });
  it("wouldCover is true when a control overlaps the spot at all", () => {
    expect(wouldCover(pillBox, 375, [box(270, 360)])).toBe(true);
    expect(wouldCover(pillBox, 375, [box(200, 262, 600, 650), box(340, 375, 640, 700)])).toBe(true);
  });
  it("controls above or below the button's band do not count, nor do ones just left of it", () => {
    expect(wouldCover(pillBox, 375, [box(270, 360, 500, 560), box(270, 360, 660, 700), box(0, 259)])).toBe(false);
  });

  it("the button hides itself (kept out of the accessibility tree) when its spot is covered, and does not move", async () => {
    // A control in the bottom-right corner.
    const row = document.createElement("main");
    row.innerHTML = '<a href="#x">row action</a>';
    document.body.appendChild(row);
    const a = row.querySelector("a")!;
    a.getBoundingClientRect = () => ({ left: 300, right: 360, top: 600, bottom: 650, width: 60, height: 50, x: 300, y: 600, toJSON() {} }) as DOMRect;
    (document as any).elementFromPoint = () => a;
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 44 });
    (window as any).innerHeight = 667; (window as any).innerWidth = 375;
    await mount();
    scrolledPast();
    expect(anyPill()).not.toBeNull();
    expect(anyPill()!.getAttribute("data-clear")).toBe("false");
    expect(anyPill()!.getAttribute("aria-hidden")).toBe("true");
    expect(anyPill()!.tabIndex).toBe(-1);
    expect(anyPill()!.className).toBe("quick-add-jump");
    delete (document as any).elementFromPoint;
    delete (HTMLElement.prototype as any).offsetWidth;
    delete (HTMLElement.prototype as any).offsetHeight;
  });
});
