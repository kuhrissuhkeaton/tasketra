import { describe, it, expect } from "vitest";
import nav from "../projectNav.ts?raw";
import icons from "../../components/NavIcon.tsx?raw";

// A project tab without a sidebar icon crashed the whole project page (v87:
// the RACI tab). The sidebar casts the tab id to an icon name, so TypeScript
// cannot catch it; this does.
describe("sidebar icons", () => {
  it("every project nav section has an icon shape", () => {
    // Project navigation lives in lib/projectNav.ts as six groups of sections.
    // v172: the sidebar lists every section again (it replaced the in-page
    // tab bars), including the old top-strip tabs, so every section id
    // needs an icon shape, no exceptions.
    const ids = [...nav.matchAll(/\{ id: "([a-z]+)", label: "[^"]+" \}/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(15);
    const shapes = icons.slice(icons.indexOf("const SHAPES"));
    for (const id of ids) expect(shapes, `missing icon for tab "${id}"`).toMatch(new RegExp(`\\n  ${id}: \\[`));
  });
});
