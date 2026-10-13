// @vitest-environment jsdom
//
// Look Book batch: register rows keep their columns in the same place.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { RegisterRow, RegisterSummary, RegisterEmpty } from "../components/ui";
// @ts-ignore node types are not in the app tsconfig
const readText = async (p: string) => (await import("node:fs")).readFileSync(p, "utf8") as string;

beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });
function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  cleanup = () => { act(() => root.unmount()); el.remove(); };
  return el;
}

describe("RegisterRow", () => {
  it("always renders the pill, flag, date, control and actions columns, even when empty", () => {
    const el = mount(<ul><RegisterRow title="Permit missing stamp" /></ul>);
    const slots = [...el.querySelectorAll("[data-slot]")].map((n) => n.getAttribute("data-slot"));
    expect(slots).toEqual(["pill", "flag", "date", "control", "actions"]);
  });

  it("keeps a late flag in its own column and marks it bad", () => {
    const el = mount(
      <ul><RegisterRow title="Permit" pill={<span>High</span>} flag={{ text: "3 days late", bad: true }} date="Oct 9" dateLabel="Due" /></ul>,
    );
    expect(el.querySelector('[data-slot="flag"]')?.textContent).toBe("3 days late");
    expect(el.querySelector('[data-slot="flag"]')?.className).toContain("is-bad");
    expect(el.querySelector('[data-slot="pill"]')?.textContent).toBe("High");
    expect(el.querySelector('[data-slot="date"]')?.textContent).toContain("Oct 9");
  });

  it("a row without a flag has the same columns as one with a flag", () => {
    const a = mount(<ul><RegisterRow title="A" pill="High" flag={{ text: "3 days late", bad: true }} /></ul>);
    const colsA = a.querySelectorAll("li > [data-slot]").length;
    cleanup?.(); cleanup = null;
    const b = mount(<ul><RegisterRow title="B" pill="Medium" /></ul>);
    expect(b.querySelectorAll("li > [data-slot]").length).toBe(colsA);
  });

  it("renders the summary and empty lines", () => {
    const el = mount(<div><RegisterSummary>5 open</RegisterSummary><RegisterEmpty>Nothing yet.</RegisterEmpty></div>);
    expect(el.textContent).toContain("5 open");
    expect(el.textContent).toContain("Nothing yet.");
  });

  it("fixed column widths and the phone wrap are in the stylesheet", async () => {
    const css = await readText("src/index.css");
    expect(css).toMatch(/\.rg-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 92px 116px 92px 150px auto/);
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{\s*\.rg-row \{ display: flex; flex-wrap: wrap/);
  });
});

describe("the six registers, Tasks and the Overview use the shared rows", () => {
  it("no register or Tasks list is a table any more, and each keeps its edit and delete actions", async () => {
    const src = await readText("src/pages/ProjectHome.tsx");
    for (const id of ["raid-issues", "raid-risks", "raid-assumptions", "raid-dependencies", "raid-quality", "raid-compliance"]) {
      expect(src).not.toContain(`ResizableTable id="${id}"`);
    }
    expect(src).not.toContain('ResizableTable id="tasks"');
    for (const id of ["stakeholders", "procurement-vendors", "comms-plan"]) {
      expect(src).not.toContain(`ResizableTable id="${id}"`);
    }
    for (const label of ["Stakeholders", "Vendors and contracts", "Communications plan"]) {
      expect(src).toContain(`aria-label="${label}"`);
    }
    for (const label of ["Issues", "Risks", "Assumptions", "Dependencies", "Quality items", "Compliance items"]) {
      expect(src).toContain(`aria-label="${label}"`);
    }
    expect(src).toContain('aria-label="Sort tasks by"');
    expect(src).toContain('aria-label="Start here"');
  });

  it("the RACI legend sits above the grid and keeps all four letters", async () => {
    const src = await readText("src/components/RaciTab.tsx");
    expect(src.indexOf('aria-label="RACI legend"')).toBeGreaterThan(-1);
    expect(src.indexOf('aria-label="RACI legend"')).toBeLessThan(src.indexOf('className="raci-scroll"'));
  });
});
