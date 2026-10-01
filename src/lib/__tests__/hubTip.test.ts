import { describe, it, expect } from "vitest";
import { shouldShowHubTip, HUB_TIP_MAX_PROJECTS } from "../hubTip";

describe("shouldShowHubTip", () => {
  it("shows for someone with no projects yet", () => {
    expect(shouldShowHubTip({ loading: false, projectCount: 0, dismissed: false })).toBe(true);
  });

  it("shows up to and including the limit, then stops", () => {
    expect(shouldShowHubTip({ loading: false, projectCount: HUB_TIP_MAX_PROJECTS, dismissed: false })).toBe(true);
    expect(shouldShowHubTip({ loading: false, projectCount: HUB_TIP_MAX_PROJECTS + 1, dismissed: false })).toBe(false);
  });

  it("stays hidden while the list is loading, so it does not flash", () => {
    expect(shouldShowHubTip({ loading: true, projectCount: 0, dismissed: false })).toBe(false);
  });

  it("stays hidden once dismissed, whatever the project count", () => {
    expect(shouldShowHubTip({ loading: false, projectCount: 0, dismissed: true })).toBe(false);
  });
});
