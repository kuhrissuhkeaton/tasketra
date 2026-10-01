// Pure RACI rules, shared by the editor, the printable page and the public
// page. Warnings are advice, never blocks: Tasketra lets you save any matrix.

export type RaciRole = "R" | "A" | "AR" | "C" | "I";

export const RACI_ROLE_LABEL: Record<RaciRole, string> = {
  R: "Responsible",
  A: "Accountable",
  AR: "Accountable and Responsible",
  C: "Consulted",
  I: "Informed",
};

export const RACI_LEGEND: { role: RaciRole; text: string }[] = [
  { role: "R", text: "Responsible: does the work." },
  { role: "A", text: "Accountable: the one person who answers for the result." },
  { role: "AR", text: "Both: the same person does the work and owns it." },
  { role: "C", text: "Consulted: gives input before it is decided or done." },
  { role: "I", text: "Informed: is told afterwards." },
];

/** Max Responsible people on one row before we suggest splitting it. */
export const MAX_RESPONSIBLE = 4;

const CYCLE: (RaciRole | null)[] = [null, "R", "A", "AR", "C", "I"];

/** The next value when a cell is clicked: empty, R, A, AR, C, I, then empty again. */
export function nextRole(current: RaciRole | null): RaciRole | null {
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + 1) % CYCLE.length];
}

const isAccountable = (r: RaciRole) => r === "A" || r === "AR";
const isResponsible = (r: RaciRole) => r === "R" || r === "AR";

export type RowWarning = "empty" | "no-accountable" | "many-accountable" | "no-responsible" | "many-responsible";

export const ROW_WARNING_TEXT: Record<RowWarning, string> = {
  empty: "Nobody assigned yet",
  "no-accountable": "No one is Accountable",
  "many-accountable": "More than one Accountable",
  "no-responsible": "No one is Responsible",
  "many-responsible": `More than ${MAX_RESPONSIBLE} Responsible, consider splitting`,
};

/** Warnings for one row, given the roles assigned on it. An empty row gets only "empty". */
export function rowWarnings(roles: RaciRole[]): RowWarning[] {
  if (roles.length === 0) return ["empty"];
  const out: RowWarning[] = [];
  const a = roles.filter(isAccountable).length;
  const r = roles.filter(isResponsible).length;
  if (a === 0) out.push("no-accountable");
  if (a > 1) out.push("many-accountable");
  if (r === 0) out.push("no-responsible");
  if (r > MAX_RESPONSIBLE) out.push("many-responsible");
  return out;
}

export type RaciAssignment = { itemId: string; personKey: string; role: RaciRole };

/** Lookup of "row|person" to role. */
export function cellMap(assignments: RaciAssignment[]): Map<string, RaciRole> {
  return new Map(assignments.map((a) => [`${a.itemId}|${a.personKey}`, a.role]));
}

export function rolesForRow(assignments: RaciAssignment[], itemId: string): RaciRole[] {
  return assignments.filter((a) => a.itemId === itemId).map((a) => a.role);
}

/** How many rows have a problem (any warning other than "empty"), for a summary line. */
export function rowsNeedingAttention(rowIds: string[], assignments: RaciAssignment[]): number {
  return rowIds.filter((id) => rowWarnings(rolesForRow(assignments, id)).some((w) => w !== "empty")).length;
}

type RowLike = { type: string; phaseId?: string | null };

/** True for the first task row that has no phase, where the "Other tasks" heading goes. */
export function startsOtherTasks(rows: RowLike[], index: number): boolean {
  const r = rows[index];
  if (!r || r.type !== "task" || r.phaseId) return false;
  const prev = rows[index - 1];
  return !(prev && prev.type === "task" && !prev.phaseId);
}

/** The label for the first column: mention tasks only when there are some. */
export function rowHeadLabel(rows: RowLike[]): string {
  return rows.some((r) => r.type === "task") ? "Phase / milestone / task" : "Phase / milestone";
}
