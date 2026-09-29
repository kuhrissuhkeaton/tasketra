import { describe, it, expect } from "vitest";
import { approvalStatus, charterApprovalContext, charterApprovalTitle } from "../charterApproval.ts";

describe("charterApprovalContext", () => {
  it("lists filled fields in a fixed order and skips empty ones", () => {
    expect(charterApprovalContext({ sponsor: "Dana", purpose: "Open a clinic" })).toBe("Purpose\nOpen a clinic\n\nSponsor\nDana");
  });
  it("is empty for an empty charter", () => {
    expect(charterApprovalContext({})).toBe("");
  });
  it("names the project in the title", () => {
    expect(charterApprovalTitle("Riverside")).toBe("Approve the charter for Riverside");
  });
});

describe("approvalStatus", () => {
  it("is pending until resolved", () => {
    expect(approvalStatus({ status: "open", chosen_option: null })).toBe("pending");
  });
  it("reads the sponsor's answer", () => {
    expect(approvalStatus({ status: "resolved", chosen_option: "Approve" })).toBe("approved");
    expect(approvalStatus({ status: "resolved", chosen_option: "Request changes" })).toBe("changes_requested");
  });
});
