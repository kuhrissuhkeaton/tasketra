// @vitest-environment jsdom
//
// Batch B: required-field messages, focus return after add, live announcements.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useState } from "react";
import { QuickAddForm } from "../components/QuickAddForm";
import { AddForm } from "../components/AddForm";
import { announce } from "../lib/announce";

let host: HTMLDivElement;
let root: Root;
const submitted = vi.fn();
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  submitted.mockReset();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = () => {};
  (globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const submit = (f: HTMLFormElement) => act(() => { f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function Quick() {
  const [title, setTitle] = useState("");
  return (
    <QuickAddForm
      storageKey="b"
      hasRows
      onSubmit={(e) => { e.preventDefault(); submitted(title); setTitle(""); }}
      quick={<><input aria-label="Title" aria-required="true" value={title} onChange={(e) => setTitle(e.target.value)} /><button>Add</button></>}
      more={<span />}
    />
  );
}
function Plain() {
  const [amt, setAmt] = useState("");
  return (
    <AddForm onSubmit={(e) => { e.preventDefault(); submitted(amt); setAmt(""); }}>
      <input aria-label="Amount" aria-required="true" data-positive="true" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <button>Add</button>
    </AddForm>
  );
}

describe("QuickAddForm required handling", () => {
  it("empty submit shows an alert, marks the field invalid, focuses it, and does not submit", () => {
    act(() => root.render(<Quick />));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    submit(host.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("Title");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
  });
  it("whitespace-only counts as empty and typing clears the message", () => {
    act(() => root.render(<Quick />));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    act(() => type(input, "   "));
    submit(host.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    act(() => type(input, "x"));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
  it("returns focus to the first field after a successful add (keyboard)", async () => {
    act(() => root.render(<Quick />));
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })); });
    act(() => type(input, "hello"));
    (host.querySelector("button") as HTMLButtonElement).focus();
    submit(form);
    await flush();
    expect(submitted).toHaveBeenCalledWith("hello");
    expect(document.activeElement).toBe(input);
  });
  it("does not steal focus after a touch add", async () => {
    act(() => root.render(<Quick />));
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
    const btn = host.querySelector("button") as HTMLButtonElement;
    act(() => type(input, "hello"));
    const ev = new Event("pointerdown", { bubbles: true }) as any;
    ev.pointerType = "touch";
    act(() => { btn.dispatchEvent(ev); });
    btn.focus();
    submit(form);
    await flush();
    expect(submitted).toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
  });
});

describe("AddForm", () => {
  it("blocks a zero or empty amount when data-positive is set", () => {
    act(() => root.render(<Plain />));
    const input = host.querySelector<HTMLInputElement>("input")!;
    act(() => type(input, "0"));
    submit(host.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("more than 0");
  });
  it("submits a positive amount", () => {
    act(() => root.render(<Plain />));
    act(() => type(host.querySelector("input")!, "12"));
    submit(host.querySelector("form")!);
    expect(submitted).toHaveBeenCalledWith("12");
  });
});

describe("announce()", () => {
  it("writes into a persistent polite live region", () => {
    vi.useFakeTimers();
    announce("Task added.");
    vi.advanceTimersByTime(100);
    const r = document.getElementById("app-live-region")!;
    expect(r.getAttribute("role")).toBe("status");
    expect(r.getAttribute("aria-live")).toBe("polite");
    expect(r.textContent).toBe("Task added.");
    vi.useRealTimers();
  });
});

const projectHome = Object.values(
  import.meta.glob("../pages/ProjectHome.tsx", { query: "?raw", import: "default", eager: true }),
)[0] as string;
describe("tab reloads update in place (no skeleton remount)", () => {
  it("no tab load() sets loading back to true; the projectId effects do", () => {
    const loads = [...projectHome.matchAll(/async function load\(\) \{([\s\S]*?)\n  \}\n/g)];
    expect(loads.length).toBeGreaterThan(10);
    for (const m of loads) expect(m[1]).not.toContain("setLoading(true)");
    expect(projectHome).toContain("setLoading(true);");
  });
});
