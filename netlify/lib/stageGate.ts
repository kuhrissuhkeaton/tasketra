// Optional sponsor sign-off when a project moves to the next stage. Like the
// charter approval it rides on a normal Decision. These pure helpers build the
// title and text and read the answer back. Nothing here ever blocks a move.

import type { Charter } from "./charter.ts";
import { STAGE_LABEL, isStage, type Stage } from "./stageChecklist.ts";

export const GATE_OPTIONS = ["Approve", "Request changes"] as const;

export type GateRef = { decisionId: string; from: Stage; to: Stage };

export function gateTitle(projectName: string, from: Stage, to: Stage): string {
  return `Approve moving ${projectName} from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}`;
}

export function gateContext(projectName: string, from: Stage, to: Stage, charter: Charter): string {
  const lines = [`${projectName} is ready to move from ${STAGE_LABEL[from]} to ${STAGE_LABEL[to]}. Approve to let the work continue, or ask for changes first.`];
  if (charter.purpose) lines.push(`Purpose\n${charter.purpose}`);
  if (charter.timeline) lines.push(`Summary timeline\n${charter.timeline}`);
  if (charter.budget) lines.push(`Summary budget\n${charter.budget}`);
  return lines.join("\n\n");
}

/** Reads the stored reference back safely; anything malformed is treated as no gate. */
export function parseGateRef(value: unknown): GateRef | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.decisionId !== "string" || !isStage(v.from) || !isStage(v.to)) return null;
  return { decisionId: v.decisionId, from: v.from, to: v.to };
}
