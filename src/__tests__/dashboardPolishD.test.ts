// v118: all registers start collapsed when empty; Dashboard polish guards.
import { describe, it, expect } from "vitest";

async function read(path: string): Promise<string> {
  // @ts-ignore node builtin: the app tsconfig has no node types, vitest runs in node
  const { readFileSync } = await import("node:fs");
  return readFileSync(path, "utf8");
}

describe("every register's quick-add starts collapsed when empty", () => {
  it("passes startExpanded={false} to all 11 QuickAddForm usages", async () => {
    const src = await read("src/pages/ProjectHome.tsx");
    const forms = src.split("<QuickAddForm").slice(1);
    expect(forms.length).toBe(11);
    for (const f of forms) {
      const head = f.slice(0, 300);
      const key = /storageKey="([^"]+)"/.exec(head)?.[1];
      expect(head, `register ${key}`).toContain("startExpanded={false}");
    }
  });
});

describe("Dashboard polish", () => {
  it("header shows decisions only; overdue stays as a KPI tile", async () => {
    const src = await read("src/pages/Dashboard.tsx");
    expect(src).toContain("decisions awaiting response");
    expect(src).not.toMatch(/overdue tasks<\/div>/);
    expect(src).toContain("Overdue");
  });
  it("KPI tiles flex-wrap so the last row fills, pills never wrap, dark-mode colours use --navy", async () => {
    const css = await read("src/index.css");
    expect(css).toMatch(/\.dash-kpis \{ display: flex; flex-wrap: wrap;/);
    expect(css).toMatch(/\.pill \{ display: inline-block; white-space: nowrap;/);
    expect(css).toMatch(/\.stage-chip-dot \{[^}]*background: var\(--navy\)/);
    expect(css).toMatch(/\.gantt-bar-in_progress \{ background: var\(--navy\)/);
    expect(css).toContain(".dashboard-filters .roadmap-filter-group");
  });
});
