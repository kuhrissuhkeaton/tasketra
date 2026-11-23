// v171: extra_tabs parsing and the grow-in-place visibility rule.
import { describe, it, expect } from "vitest";
import { parseExtraTabs, isTabHidden, hiddenTabLabels, hiddenTabIds } from "../lib/projectView";
import { visibleGroups, hiddenSections } from "../lib/projectNav";

describe("parseExtraTabs", () => {
  it("parses a stored JSON array of tab ids", () => {
    expect(parseExtraTabs('["budget","meetings"]')).toEqual(["budget", "meetings"]);
  });

  it("treats null, empty, and unreadable values as no extras", () => {
    expect(parseExtraTabs(null)).toEqual([]);
    expect(parseExtraTabs(undefined)).toEqual([]);
    expect(parseExtraTabs("")).toEqual([]);
    expect(parseExtraTabs("not json")).toEqual([]);
    expect(parseExtraTabs('{"budget":true}')).toEqual([]);
    expect(parseExtraTabs('[1,2]')).toEqual([]);
  });

  it("drops non-strings and duplicates", () => {
    expect(parseExtraTabs('["budget",7,"budget","risks"]')).toEqual(["budget", "risks"]);
  });
});

describe("grow-in-place visibility", () => {
  it("a grown-back tab is no longer hidden, others stay hidden", () => {
    expect(isTabHidden("budget", "light", false)).toBe(true);
    expect(isTabHidden("budget", "light", false, ["budget"])).toBe(false);
    expect(isTabHidden("meetings", "light", false, ["budget"])).toBe(true);
  });

  it("show-all still reveals everything, extras or not", () => {
    expect(isTabHidden("budget", "light", true)).toBe(false);
    expect(isTabHidden("budget", "light", true, [])).toBe(false);
  });

  it("hidden labels shrink as pieces are grown back", () => {
    const all = hiddenTabLabels("light");
    expect(all).toHaveLength(hiddenTabIds("light").length);
    expect(hiddenTabLabels("light", ["budget"])).toEqual(all.filter((l) => l !== "Budget"));
  });

  it("the nav and the More sections list include a grown-back section", () => {
    const groups = visibleGroups("home", "light", false, ["budget"]);
    const plan = groups.find((g) => g.group.id === "plan");
    expect(plan?.sections.map((s) => s.id)).toContain("budget");
    expect(hiddenSections("light", false, ["budget"]).map((s) => s.id)).not.toContain("budget");
    // And without the extra, budget stays out of the nav and in the list.
    const plain = visibleGroups("home", "light", false);
    expect(plain.find((g) => g.group.id === "plan")?.sections.map((s) => s.id)).not.toContain("budget");
    expect(hiddenSections("light", false).map((s) => s.id)).toContain("budget");
  });
});
