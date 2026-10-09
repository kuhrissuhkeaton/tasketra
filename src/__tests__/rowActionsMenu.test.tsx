// @vitest-environment jsdom
//
// RowActionsMenu: the "..." menu for less-used row actions.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { RowActionsMenu } from "../components/RowActionsMenu";

let host: HTMLDivElement;
let root: Root;
const a = vi.fn();
const b = vi.fn();
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  a.mockReset(); b.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(
    <RowActionsMenu label="More actions for Test" items={[
      { label: "Promote", onSelect: a },
      { label: "Delete", danger: true, onSelect: b },
    ]} />,
  ));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const btn = () => host.querySelector<HTMLButtonElement>(".row-menu-btn")!;
const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); });

describe("RowActionsMenu", () => {
  it("is closed by default with an accessible name and menu semantics", () => {
    expect(btn().getAttribute("aria-label")).toBe("More actions for Test");
    expect(btn().getAttribute("aria-haspopup")).toBe("menu");
    expect(btn().getAttribute("aria-expanded")).toBe("false");
    expect(items().length).toBe(0);
  });

  it("opens on click, focuses the first item and exposes aria-expanded/controls", () => {
    act(() => btn().click());
    expect(btn().getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector('[role="menu"]')!.id).toBe(btn().getAttribute("aria-controls"));
    expect(document.activeElement).toBe(items()[0]);
  });

  it("opens with Arrow Down from the button", () => {
    key(btn(), "ArrowDown");
    expect(items().length).toBe(2);
    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves with arrows, Home and End and wraps", () => {
    act(() => btn().click());
    key(items()[0], "ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], "ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], "End");
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], "Home");
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], "ArrowUp");
    expect(document.activeElement).toBe(items()[1]);
  });

  it("Escape closes and returns focus to the button", () => {
    act(() => btn().click());
    key(items()[0], "Escape");
    expect(items().length).toBe(0);
    expect(document.activeElement).toBe(btn());
  });

  it("Tab and an outside click close it", () => {
    act(() => btn().click());
    key(items()[0], "Tab");
    expect(items().length).toBe(0);
    act(() => btn().click());
    act(() => { document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    expect(items().length).toBe(0);
  });

  it("runs only the chosen item's handler, then closes", () => {
    act(() => btn().click());
    act(() => items()[1].click());
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(items().length).toBe(0);
  });

  it("marks the destructive item", () => {
    act(() => btn().click());
    expect(items()[1].className).toContain("row-menu-item-danger");
    expect(items()[0].className).not.toContain("danger");
  });
});
