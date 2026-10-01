import { describe, it, expect } from "vitest";
import { GUIDE_STAGES, GUIDE_PRINCIPLE, guideTabNames } from "../hubGuide";
// The app source as text, so the guide cannot drift from the real tab names.
import projectHome from "../../pages/ProjectHome.tsx?raw";

describe("Resource hub guide", () => {
  it("covers the four stages in order", () => {
    expect(GUIDE_STAGES.map((s) => s.id)).toEqual(["initiate", "plan", "execute", "close"]);
  });

  it("gives every stage a goal, a checklist line and at least three steps", () => {
    for (const s of GUIDE_STAGES) {
      expect(s.goal.length).toBeGreaterThan(10);
      expect(s.checklist.length).toBeGreaterThan(5);
      expect(s.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of s.steps) {
        expect(step.title.trim()).not.toBe("");
        expect(step.why.trim()).not.toBe("");
      }
    }
  });

  it("only points at tabs that exist in the project navigation", () => {
    // Tab labels come from the nav arrays in ProjectHome.tsx and from
    // projectView.ts; the home-grown extras are sub-views that the app names
    // inside another tab ("Weekly report" hosts Lessons).
    for (const name of guideTabNames()) {
      expect(projectHome.includes(`label: "${name}"`), `tab "${name}" is not labelled in ProjectHome.tsx`).toBe(true);
    }
  });

  it("states the nothing-blocks principle", () => {
    expect(GUIDE_PRINCIPLE).toMatch(/Nothing blocks you/);
  });

  it("marks exactly the steps whose tabs Light hides", () => {
    const flagged = GUIDE_STAGES.flatMap((s) => s.steps.filter((x) => x.lightHides).map((x) => x.tab)).sort();
    expect(flagged).toEqual(["Budget", "Budget", "Comms plan", "RACI"]);
  });
});
