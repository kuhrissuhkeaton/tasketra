import { describe, it, expect } from "vitest";
import { capacityLevel } from "../capacity.ts";

describe("capacityLevel", () => {
  it("reads a light load as on track", () => {
    expect(capacityLevel(0, 0, 0)).toBe("ok");
    expect(capacityLevel(3, 0, 0)).toBe("ok");
    expect(capacityLevel(5, 0, 0)).toBe("ok");
  });

  it("flags busy once open count or overdue/blocked signals climb", () => {
    expect(capacityLevel(6, 0, 0)).toBe("busy"); // score threshold
    expect(capacityLevel(2, 0, 1)).toBe("busy"); // any overdue task
    expect(capacityLevel(2, 2, 0)).toBe("busy"); // two blocked tasks
  });

  it("flags overloaded once the score or overdue count crosses the higher bar", () => {
    expect(capacityLevel(12, 0, 0)).toBe("overloaded"); // score threshold
    expect(capacityLevel(1, 0, 3)).toBe("overloaded"); // three overdue tasks, regardless of score
  });

  it("weighs overdue heavier than blocked, and blocked heavier than plain open", () => {
    // Same total count (5), but composition changes the read.
    expect(capacityLevel(5, 0, 0)).toBe("ok");      // 5 open -> score 5
    expect(capacityLevel(3, 2, 0)).toBe("busy");     // 3 open + 2 blocked -> score 6, also blocked>=2
    expect(capacityLevel(3, 0, 2)).toBe("busy");     // 3 open + 2 overdue -> score 7, also overdue>=1
  });

  it("never returns a level outside the known set", () => {
    const levels = new Set<string>();
    for (let open = 0; open <= 15; open++) {
      for (let overdue = 0; overdue <= 5; overdue++) {
        levels.add(capacityLevel(open, 0, overdue));
      }
    }
    for (const level of levels) {
      expect(["ok", "busy", "overloaded"]).toContain(level);
    }
  });
});
