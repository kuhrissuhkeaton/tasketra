// @vitest-environment jsdom
//
// Batch C: labelled confirm button, email-friendly wrapping, modal scroll lock,
// and the row-action pattern (a visible first action plus a "..." menu for Delete).
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ConfirmProvider, useConfirm } from "../components/ConfirmDialog";
import { Modal } from "../components/Modal";
import { breakable } from "../lib/breakable";
import { hasVisibleLabel } from "../components/ResizableTable";

let host: HTMLDivElement;
let root: Root;
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.removeAttribute("style"); });
function mount(node: React.ReactNode) {
  host = document.createElement("div"); document.body.appendChild(host);
  root = createRoot(host); act(() => root.render(node));
}

function Asker({ label }: { label?: string }) {
  const confirm = useConfirm();
  return <button id="ask" onClick={() => { void confirm("Sure?", label); }}>ask</button>;
}

describe("ConfirmDialog button label", () => {
  it("defaults to Confirm and takes a specific label", () => {
    mount(<ConfirmProvider><Asker /></ConfirmProvider>);
    act(() => host.querySelector<HTMLButtonElement>("#ask")!.click());
    expect(document.querySelector(".confirm-actions .btn-danger")!.textContent).toBe("Confirm");
    act(() => root.unmount()); host.remove();
    mount(<ConfirmProvider><Asker label="Delete" /></ConfirmProvider>);
    act(() => host.querySelector<HTMLButtonElement>("#ask")!.click());
    expect(document.querySelector(".confirm-actions .btn-danger")!.textContent).toBe("Delete");
    expect(document.querySelector(".confirm-actions .btn-ghost")!.textContent).toBe("Cancel");
  });
});

describe("breakable()", () => {
  const render = (s: string) => { mount(<span>{breakable(s)}</span>); return host.querySelector("span")!; };
  it("keeps the text identical and adds break hints to emails and dotted names", () => {
    const e = render("first.last@example-company.com");
    expect(e.textContent).toBe("first.last@example-company.com");
    expect(e.querySelectorAll("wbr").length).toBeGreaterThan(2);
  });
  it("leaves names with spaces and plain words alone", () => {
    expect(render("Alex Rivera").querySelectorAll("wbr").length).toBe(0);
    act(() => root.unmount()); host.remove();
    expect(render("Maya").querySelectorAll("wbr").length).toBe(0);
  });
});

describe("Modal scroll lock", () => {
  it("locks page scroll while open and restores it on close", () => {
    document.body.style.overflow = "auto";
    mount(<Modal title="New project" onClose={() => {}}><p>hi</p></Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    act(() => root.unmount());
    expect(document.body.style.overflow).toBe("auto");
    host.remove();
    root = createRoot(document.createElement("div"));
  });
});

const sources = import.meta.glob("../pages/ProjectHome.tsx", { query: "?raw", import: "default", eager: true });
const projectHome = Object.values(sources)[0] as string;

describe("row actions pattern (static)", () => {
  it("only the single-action rows keep an inline Delete link", () => {
    const inline = [...projectHome.matchAll(/<button className="btn-link btn-link-danger"[^>]*onClick=\{\(\) => (\w+)\(/g)].map((m) => m[1]).sort();
    expect(inline).toEqual(["remove", "removeDecision", "removeDocument", "removeMeeting"]);
  });
  it("the converted rows put Delete in a labelled row menu", () => {
    for (const fn of ["removeAssumption", "removeDependency", "removeObjective", "removeKeyResult", "removeStakeholder", "removeChangeRequest", "removeLesson"]) {
      expect(projectHome).toMatch(new RegExp(`label=\\{\`More actions for[^\\n]*\\n\\s*items=\\{\\[\\{ label: "Delete", danger: true, onSelect: \\(\\) => ${fn}\\(`));
    }
  });
  it("sub-task and decision forms mark their required fields", () => {
    expect(projectHome).toContain('aria-label="Sub-task title" aria-required="true"');
    expect(projectHome).toContain("Add at least two options, separated by commas.");
  });
});

describe("hasVisibleLabel (Actions column detection)", () => {
  const th = (html: string) => { const e = document.createElement("th"); e.innerHTML = html; return e; };
  it("treats a header with only sr-only text as unlabelled, so its width floor still applies", () => {
    expect(hasVisibleLabel(th('<span class="sr-only">Actions</span>'))).toBe(false);
    expect(hasVisibleLabel(th(""))).toBe(false);
  });
  it("counts real header text", () => {
    expect(hasVisibleLabel(th("Status"))).toBe(true);
    expect(hasVisibleLabel(th('Owner <span class="sr-only">(sortable)</span>'))).toBe(true);
  });
});
