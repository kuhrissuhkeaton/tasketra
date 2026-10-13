import { describe, it, expect } from "vitest";
import nav from "../projectNav.ts?raw";
import { STRIP_TABS } from "../projectNav";
import icons from "../../components/NavIcon.tsx?raw";

// A project tab without a sidebar icon crashed the whole project page (v87:
// the RACI tab). The sidebar casts the tab id to an icon name, so TypeScript
// cannot catch it; this does.
describe("sidebar icons", () => {
  it("every project nav section has an icon shape", () => {
    // Project navigation now lives in lib/projectNav.ts as six groups of sections. The sidebar no
    // longer lists them, but the icon shapes are kept in step so a tab can never lack one.
    const ids = [...nav.matchAll(/\{ id: "([a-z]+)", label: "[^"]+" \}/g)].map((m) => m[1]).filter((id) => !STRIP_TABS.has(id)); // the old top-strip tabs never had sidebar icons
    expect(ids.length).toBeGreaterThan(15);
    const shapes = icons.slice(icons.indexOf("const SHAPES"));
    for (const id of ids) expect(shapes, `missing icon for tab "${id}"`).toMatch(new RegExp(`\\n  ${id}: \\[`));
  });
});
