// Sponsor approval of a charter rides on the existing Decisions feature: the
// charter is snapshotted into a decision the sponsor answers from a public
// link. These pure helpers build that snapshot and read the answer back.

import type { Charter } from "./charter.ts";

export const APPROVAL_OPTIONS = ["Approve", "Request changes"] as const;

const SECTIONS: { key: keyof Charter; label: string }[] = [
  { key: "purpose", label: "Purpose" },
  { key: "objectives", label: "Objectives" },
  { key: "scope_in", label: "In scope" },
  { key: "scope_out", label: "Out of scope" },
  { key: "sponsor", label: "Sponsor" },
  { key: "budget", label: "Summary budget" },
  { key: "timeline", label: "Summary timeline" },
  { key: "success", label: "Success measures" },
];

/** The charter as plain text, in a fixed order, skipping empty fields. */
export function charterApprovalContext(charter: Charter): string {
  return SECTIONS.filter((s) => charter[s.key])
    .map((s) => `${s.label}\n${charter[s.key]}`)
    .join("\n\n");
}

export function charterApprovalTitle(projectName: string): string {
  return `Approve the charter for ${projectName}`;
}

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export function approvalStatus(row: { status: string; chosen_option: string | null }): ApprovalStatus {
  if (row.status !== "resolved") return "pending";
  return row.chosen_option === APPROVAL_OPTIONS[0] ? "approved" : "changes_requested";
}
