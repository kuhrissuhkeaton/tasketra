// @vitest-environment jsdom
//
// Foundation batch: the shared "Today look" pieces.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PageHeader, SoftCard, EmptyState, StatusPill, AlignedList, ListGroupHead, ListRow } from "../components/ui";
// @ts-ignore node types are not in the app tsconfig
const readCss = async () => (await import("node:fs")).readFileSync("src/index.css", "utf8") as string;

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

describe("PageHeader", () => {
  it("shows a title, one muted summary line and the actions", () => {
    const el = mount(<PageHeader title="Issues" subtitle="5 open, 2 high" actions={<button className="btn btn-primary">Add issue</button>} />);
    expect(el.querySelector("h1")?.textContent).toBe("Issues");
    expect(el.querySelector(".tw-sub")?.textContent).toBe("5 open, 2 high");
    expect(el.querySelectorAll(".page-head-actions .btn-primary")).toHaveLength(1);
  });
  it("omits the subtitle and actions when none are given", () => {
    const el = mount(<PageHeader title="Billing" />);
    expect(el.querySelector(".tw-sub")).toBeNull();
    expect(el.querySelector(".page-head-actions")).toBeNull();
  });
});

describe("SoftCard, EmptyState, StatusPill", () => {
  it("renders a titled card", () => {
    const el = mount(<SoftCard title="Plan">body</SoftCard>);
    expect(el.querySelector(".tw-card .ui-card-title")?.textContent).toBe("Plan");
  });
  it("an empty state carries exactly one action", () => {
    const el = mount(<EmptyState title="No risks logged" action={<button className="btn btn-primary">Add a risk</button>}>Write down what could go wrong.</EmptyState>);
    expect(el.querySelectorAll("button")).toHaveLength(1);
    expect(el.textContent).toContain("Write down what could go wrong.");
  });
  it("a pill always carries its text, not just a colour", () => {
    const el = mount(<StatusPill tone="red">High</StatusPill>);
    expect(el.querySelector(".pill-red")?.textContent).toBe("High");
  });
});

describe("AlignedList / ListRow", () => {
  it("every row renders status, flag and date columns in the same order, even when empty", () => {
    const el = mount(
      <AlignedList label="Issues">
        <ListGroupHead title="Open" count={2} />
        <ListRow title="Crane access" meta="Priya" status={<StatusPill tone="red">High</StatusPill>} date="Oct 14" />
        <ListRow title="Permit stamp" meta="Karissa" status={<StatusPill tone="red">High</StatusPill>} flag={<span>3 days late</span>} date="Oct 9" />
        <ListRow title="Paint colour" status={<StatusPill tone="gold">Medium</StatusPill>} />
      </AlignedList>,
    );
    const rows = Array.from(el.querySelectorAll(".ar-row"));
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      const slots = Array.from(r.querySelectorAll("[data-slot]")).map((s) => s.getAttribute("data-slot"));
      expect(slots).toEqual(["status", "flag", "date"]);
    }
    // the "3 days late" flag sits in the flag column, so the status pill stays in its own column
    expect(rows[1].querySelector('[data-slot="flag"]')?.textContent).toBe("3 days late");
    expect(rows[1].querySelector('[data-slot="status"]')?.textContent).toBe("High");
    expect(rows[0].querySelector('[data-slot="flag"]')?.textContent).toBe("");
    expect(el.querySelector('ul[aria-label="Issues"]')).not.toBeNull();
  });
  it("a lead (checkbox) goes first and marks the row", () => {
    const el = mount(<AlignedList label="Tasks"><ListRow lead={<input type="checkbox" aria-label="Done" />} title="Sign off drawings" /></AlignedList>);
    expect(el.querySelector(".ar-row.has-lead .ar-lead input")).not.toBeNull();
  });
  it("css gives status, flag and date fixed widths and wraps them under the title on phones", async () => {
    const css = await readCss();
    expect(css).toMatch(/\.ar-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 84px 92px 92px/);
    expect(css).toMatch(/@media \(max-width: 600px\) \{\s*\.ar-row/);
    expect(css).toMatch(/\.ar-status:empty, \.ar-flag:empty, \.ar-date:empty \{ display: none/);
  });
});
