import { describe, it, expect } from "vitest";
import { nextRole, rowWarnings, cellMap, rowsNeedingAttention, MAX_RESPONSIBLE } from "../raci";

describe("raci rules", () => {
  it("cycles empty, R, A, AR, C, I and back to empty", () => {
    const seen: (string | null)[] = [];
    let v: any = null;
    for (let i = 0; i < 6; i++) { seen.push(v); v = nextRole(v); }
    expect(seen).toEqual([null, "R", "A", "AR", "C", "I"]);
    expect(v).toBeNull();
  });

  it("an empty row only says it is empty", () => {
    expect(rowWarnings([])).toEqual(["empty"]);
  });

  it("a clean row has no warnings (one A, one R, any C and I)", () => {
    expect(rowWarnings(["A", "R", "C", "C", "I"])).toEqual([]);
  });

  it("AR satisfies both Accountable and Responsible", () => {
    expect(rowWarnings(["AR"])).toEqual([]);
    expect(rowWarnings(["AR", "C"])).toEqual([]);
  });

  it("flags no A, many A, and no R", () => {
    expect(rowWarnings(["R"])).toEqual(["no-accountable"]);
    expect(rowWarnings(["A", "R", "A"])).toEqual(["many-accountable"]);
    expect(rowWarnings(["AR", "A"])).toEqual(["many-accountable"]);
    expect(rowWarnings(["A", "C"])).toEqual(["no-responsible"]);
    expect(rowWarnings(["C", "I"])).toEqual(["no-accountable", "no-responsible"]);
  });

  it("warns above the Responsible cap, not at it", () => {
    const at = ["A", ...Array(MAX_RESPONSIBLE).fill("R")] as any;
    const over = ["A", ...Array(MAX_RESPONSIBLE + 1).fill("R")] as any;
    expect(rowWarnings(at)).toEqual([]);
    expect(rowWarnings(over)).toEqual(["many-responsible"]);
  });

  it("builds a lookup and counts rows with real problems (empty rows do not count)", () => {
    const a = [
      { itemId: "r1", personKey: "u:1", role: "A" as const },
      { itemId: "r1", personKey: "u:2", role: "R" as const },
      { itemId: "r2", personKey: "u:1", role: "R" as const },
    ];
    expect(cellMap(a).get("r1|u:2")).toBe("R");
    expect(rowsNeedingAttention(["r1", "r2", "r3"], a)).toBe(1);
  });
});
