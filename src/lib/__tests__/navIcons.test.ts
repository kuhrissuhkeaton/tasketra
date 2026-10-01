import { describe, it, expect } from "vitest";
import home from "../../pages/ProjectHome.tsx?raw";
import icons from "../../components/NavIcon.tsx?raw";

// A project tab without a sidebar icon crashed the whole project page (v87:
// the RACI tab). The sidebar casts the tab id to an icon name, so TypeScript
// cannot catch it; this does.
describe("sidebar icons", () => {
  it("every side-nav tab has an icon shape", () => {
    const start = home.indexOf("const SECONDARY_NAV_GROUPS");
    const end = home.indexOf("];", home.indexOf("{ label: \"Documents & output\"", start));
    const block = home.slice(start, end);
    const ids = [...block.matchAll(/\{ id: "([a-z]+)", label:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(15);
    const shapes = icons.slice(icons.indexOf("const SHAPES"));
    for (const id of ids) expect(shapes, `missing icon for tab "${id}"`).toMatch(new RegExp(`\\n  ${id}: \\[`));
  });
});
