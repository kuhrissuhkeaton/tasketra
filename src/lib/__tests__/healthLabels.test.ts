import { describe, it, expect } from "vitest";
import { headlineHealth, evidenceChallenge } from "../healthLabels";

// v156: the stated status is the headline wherever a project is summarized;
// the evidence-derived health headlines only when nothing was stated, and
// otherwise survives only as the "Evidence suggests X" challenge line.
describe("headlineHealth", () => {
  it("uses the evidence health when nothing was stated", () => {
    expect(headlineHealth({ health: "off_track", statedHealth: null })).toBe("off_track");
    expect(headlineHealth({ health: "on_track" })).toBe("on_track");
  });
  it("uses the stated status when a check-in stated one, in either direction", () => {
    expect(headlineHealth({ health: "off_track", statedHealth: "on_track" })).toBe("on_track");
    expect(headlineHealth({ health: "on_track", statedHealth: "off_track" })).toBe("off_track");
    expect(headlineHealth({ health: "at_risk", statedHealth: "at_risk" })).toBe("at_risk");
  });
});

describe("evidenceChallenge", () => {
  it("is null when nothing was stated (evidence is already the headline)", () => {
    expect(evidenceChallenge({ health: "off_track", statedHealth: null })).toBeNull();
  });
  it("is null when the stated status and the evidence agree", () => {
    expect(evidenceChallenge({ health: "at_risk", statedHealth: "at_risk" })).toBeNull();
  });
  it("is the evidence health when it disagrees with the stated headline", () => {
    expect(evidenceChallenge({ health: "off_track", statedHealth: "on_track" })).toBe("off_track");
    expect(evidenceChallenge({ health: "on_track", statedHealth: "at_risk" })).toBe("on_track");
  });
});
