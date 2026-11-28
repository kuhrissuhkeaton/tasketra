// R3-pre: quick win 9's phone sweep, pinned as CSS assertions in the
// dashboardPolishD pattern. The sweep lives in one ≤860px block at the
// end of index.css; the base (desktop) rules must keep their old values.
import { describe, it, expect } from "vitest";

async function readCss(): Promise<string> {
  // @ts-ignore node builtin: the app tsconfig has no node types, vitest runs in node
  const { readFileSync } = await import("node:fs");
  return readFileSync("src/index.css", "utf8");
}

/** The R3-pre sweep block: from its header comment to end of file. */
async function sweepBlock(): Promise<string> {
  const css = await readCss();
  const start = css.indexOf("R3-pre: quick win 9");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
}

describe("R3-pre sweep targets (≤860px block)", () => {
  it("raises both row-menu variants to 44px minimums", async () => {
    const block = await sweepBlock();
    expect(block).toMatch(/\.row-menu-btn \{ min-width: 44px; min-height: 44px; \}/);
    expect(block).toMatch(/\.page-head-actions \.row-menu-btn \{ min-width: 44px; min-height: 44px; \}/);
  });

  it("gives the dialog and drawer closes a 44px hit area", async () => {
    const block = await sweepBlock();
    expect(block).toMatch(/\.modal-close \{ min-width: 44px; min-height: 44px; \}/);
    expect(block).toMatch(/\.drawer-close \{ min-width: 44px; min-height: 44px; \}/);
  });

  it("holds the project tab strip to the 44px standard", async () => {
    const block = await sweepBlock();
    expect(block).toMatch(/\.project-tab \{ min-height: 44px; \}/);
  });

  it("extends checkbox/radio hit areas through the wrapping label only", async () => {
    const block = await sweepBlock();
    expect(block).toMatch(
      /label:not\(\.setup-seg-item\):has\(> input\[type="checkbox"\]\),\s*label:not\(\.setup-seg-item\):has\(> input\[type="radio"\]\) \{ min-height: 44px; \}/,
    );
    // The amendment's prohibitions, pinned: no pseudo-element on the
    // input itself, no appearance restyle, anywhere in the stylesheet.
    const css = await readCss();
    expect(css).not.toMatch(/input\[type="(?:checkbox|radio)"\]::/);
    expect(css).not.toMatch(/input\[type="(?:checkbox|radio)"\][^{]*\{[^}]*appearance:\s*none/);
  });

  it("moves every input to 16px, naming each override", async () => {
    const block = await sweepBlock();
    expect(block).toMatch(/input, textarea, select \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.phone-quickadd input\[type="text"\], \.phone-quickadd select \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.side-project-switcher select \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.first-run-name input \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.pw-rename input \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.pw-search input \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.sync-bullet-input \{ font-size: 16px; \}/);
    expect(block).toMatch(/\.today-list-row \.status-select \{ font-size: 16px; \}/);
    // The date field: font only -- its 32px height stays untouched.
    expect(block).toMatch(/\.tw-date input \{ font-size: 16px; \}/);
    expect(block).not.toMatch(/\.tw-date input \{[^}]*min-height/);
  });

  it("leaves the exclusions alone: no .btn or .btn-link sizing in the block", async () => {
    const block = await sweepBlock();
    expect(block).not.toMatch(/\.btn-link\s*\{/);
    expect(block).not.toMatch(/\.btn\s*\{/);
  });
});

describe("R3-pre Menu sheet backdrop (CSS)", () => {
  it("is display:none by default and a dimmed above-the-bar layer at ≤860px", async () => {
    const css = await readCss();
    expect(css).toContain(".menu-sheet-backdrop { display: none; }");
    // The in-media rule is the second .menu-sheet-backdrop rule in the
    // file (the first is the display:none default above).
    const start = css.lastIndexOf(".menu-sheet-backdrop {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("position: fixed");
    expect(rule).toContain("bottom: calc(var(--phone-bar-height)");
    expect(rule).toContain("z-index: 54");
    expect(rule).toContain("background: rgba(28, 36, 21, 0.45)");
  });
});

describe("desktop values are unchanged (the sweep is ≤860px only)", () => {
  it("keeps the base rules at their pre-R3-pre values", async () => {
    const css = await readCss();
    expect(css).toMatch(/\.row-menu-btn \{ min-width: 28px; min-height: 28px;/);
    expect(css).toMatch(/\.page-head-actions \.row-menu-btn \{ min-width: 36px; min-height: 36px;/);
    expect(css).toMatch(/\.project-tab \{\s*flex: none; min-height: 32px;/);
    expect(css).toMatch(/input, textarea, select \{[^}]*font-size: 14px;/);
    expect(css).toMatch(/input\[type="checkbox"\], input\[type="radio"\] \{\s*width: 16px;/);
  });
});
