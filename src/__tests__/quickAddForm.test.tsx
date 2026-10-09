// @vitest-environment jsdom
//
// QuickAddForm: layout-only disclosure for the register entry forms.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { QuickAddForm } from "../components/QuickAddForm";

let host: HTMLDivElement;
let root: Root;
const submitted = vi.fn();
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  sessionStorage.clear();
  submitted.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = () => {};
  (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Demo({ hasRows, requiredMore }: { hasRows: boolean; requiredMore?: boolean }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <QuickAddForm
      storageKey="test"
      hasRows={hasRows}
      onSubmit={(e) => { e.preventDefault(); submitted({ title, notes }); }}
      quick={<><input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /><button>Add</button></>}
      more={<textarea aria-label="Notes" required={requiredMore} value={notes} onChange={(e) => setNotes(e.target.value)} />}
    />
  );
}
const toggle = () => host.querySelector<HTMLButtonElement>(".quick-add-toggle")!;
const panel = () => host.querySelector<HTMLElement>(".quick-add-more")!;
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("QuickAddForm", () => {
  it("starts open for an empty register and collapsed once it has rows", () => {
    act(() => root.render(<Demo hasRows={false} />));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    act(() => root.unmount());
    root = createRoot(host);
    sessionStorage.clear();
    act(() => root.render(<Demo hasRows />));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
  });

  it("wires aria-controls to the panel and moves focus into it on expand", () => {
    act(() => root.render(<Demo hasRows />));
    expect(toggle().getAttribute("aria-controls")).toBe(panel().id);
    act(() => toggle().click());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("never clears typed values when collapsed and reopened, and submits them", () => {
    act(() => root.render(<Demo hasRows />));
    act(() => toggle().click());
    act(() => type(host.querySelector("textarea")!, "kept"));
    act(() => toggle().click());
    expect(panel().hidden).toBe(true);
    act(() => toggle().click());
    expect(host.querySelector("textarea")!.value).toBe("kept");
    act(() => type(host.querySelector("input")!, "T"));
    act(() => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submitted).toHaveBeenCalledWith({ title: "T", notes: "kept" });
  });

  it("remembers the choice for the session", () => {
    act(() => root.render(<Demo hasRows />));
    act(() => toggle().click());
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<Demo hasRows />));
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("reveals a collapsed field the browser reports as invalid, and focuses it", () => {
    act(() => root.render(<Demo hasRows requiredMore />));
    const ta = host.querySelector("textarea")!;
    act(() => { ta.dispatchEvent(new Event("invalid", { bubbles: false, cancelable: true })); });
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(ta);
  });
});
