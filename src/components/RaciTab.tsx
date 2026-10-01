import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type RaciData, type Task } from "../lib/api";
import { useConfirm } from "./ConfirmDialog";
import {
  RACI_LEGEND, RACI_ROLE_LABEL, ROW_WARNING_TEXT, cellMap, nextRole, rolesForRow, rowWarnings, rowsNeedingAttention, rowHeadLabel, startsOtherTasks,
  type RaciRole,
} from "../lib/raci";

const TYPE_LABEL: Record<string, string> = { phase: "Phase", milestone: "Milestone", task: "Task" };

/** The live RACI matrix: phases and milestones down the side, people across
 *  the top. Click a cell to cycle empty, R, A, AR, C, I. Warnings are advice. */
export function RaciTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RaciData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmDialog = useConfirm();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pickTask, setPickTask] = useState("");

  useEffect(() => {
    api.getRaci(projectId).then(setData).catch((e) => setError(e.message || "Couldn't load the RACI."));
    // Only needed for the "Add a task" picker, so a failure just leaves it empty.
    api.listTasks(projectId).then((r) => setTasks(r.tasks)).catch(() => {});
  }, [projectId]);

  async function addTask() {
    if (!pickTask) return;
    setError(null);
    try {
      await api.addRaciTask(projectId, pickTask);
      setPickTask("");
      setData(await api.getRaci(projectId));
    } catch (e: any) {
      setError(e.message || "Couldn't add that task.");
    }
  }

  async function removeTask(taskId: string, title: string) {
    if (!data) return;
    const hasLetters = data.assignments.some((a) => a.itemId === taskId);
    if (hasLetters && !(await confirmDialog(`Remove "${title}" from the RACI? Its letters are cleared. The task itself is not touched.`))) return;
    setError(null);
    try {
      await api.removeRaciTask(projectId, taskId);
      setData(await api.getRaci(projectId));
    } catch (e: any) {
      setError(e.message || "Couldn't remove that row.");
    }
  }

  async function cycle(itemId: string, personKey: string, current: RaciRole | null) {
    if (!data) return;
    const role = nextRole(current);
    const before = data;
    // Optimistic: show it now, put it back if the save fails.
    const rest = data.assignments.filter((a) => !(a.itemId === itemId && a.personKey === personKey));
    setData({ ...data, assignments: role ? [...rest, { itemId, personKey, role }] : rest });
    setError(null);
    try {
      await api.setRaciCell(projectId, itemId, personKey, role);
    } catch (e: any) {
      setData(before);
      setError(e.message || "Couldn't save that change.");
    }
  }

  if (!data) {
    return error
      ? <p className="form-error">{error}</p>
      : <div className="skel-loading-block"><div className="skel skel-text" style={{ width: "45%" }} /><div className="skel skel-text" style={{ width: "80%" }} /></div>;
  }

  const cells = cellMap(data.assignments);
  const rowIds = new Set(data.rows.map((r) => r.id));
  const addable = tasks.filter((t) => !rowIds.has(t.id));
  const attention = rowsNeedingAttention(data.rows.map((r) => r.id), data.assignments);

  return (
    <div>
      <p className="muted" style={{ maxWidth: 680, marginBottom: 12 }}>
        Who does what on each phase and milestone. Click a cell to cycle through Responsible, Accountable,
        Consulted and Informed. Each row should have exactly one Accountable person; Tasketra points out
        rows that don't, but never stops you saving. For a deliverable that needs its own owner, add an
        individual task as a row below; it sits under its phase.
      </p>
      <div className="raci-actions">
        <Link className="btn btn-primary" to={`/app/projects/${projectId}/print/raci`}>Print or share</Link>
        <span className="muted raci-summary">
          {data.rows.length === 0 ? "" : attention === 0 ? "No rows need attention." : `${attention} ${attention === 1 ? "row needs" : "rows need"} attention.`}
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}

      {addable.length > 0 && (
        <div className="raci-add-task">
          <label htmlFor="raci-add-task">Add a task as a row</label>
          <select id="raci-add-task" value={pickTask} onChange={(e) => setPickTask(e.target.value)}>
            <option value="">Choose a task...</option>
            {addable.map((t) => <option key={t.id} value={t.id}>{t.title}{t.status === "done" ? " (done)" : ""}</option>)}
          </select>
          <button className="btn btn-ghost" type="button" disabled={!pickTask} onClick={addTask}>Add row</button>
        </div>
      )}

      {data.rows.length === 0 ? (
        <p className="muted">Add phases or milestones on the Roadmap tab and they will appear here as rows.</p>
      ) : data.people.length === 0 ? (
        <p className="muted">Add stakeholders or invite team members and they will appear here as columns.</p>
      ) : (
        <div className="raci-scroll">
          <table className="raci-table">
            <thead>
              <tr>
                <th className="raci-row-head">{rowHeadLabel(data.rows)}</th>
                {data.people.map((p) => (
                  <th key={p.key} className="raci-col-head" title={p.role ?? undefined}>
                    <span className="raci-person">{p.name}</span>
                    {p.role && <span className="raci-person-role">{p.role}</span>}
                  </th>
                ))}
                <th className="raci-warn-head no-print">Check</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.flatMap((r, i) => {
                const warnings = rowWarnings(rolesForRow(data.assignments, r.id));
                return [
                  startsOtherTasks(data.rows, i) ? (
                    <tr key={`${r.id}-group`} className="raci-group"><th colSpan={data.people.length + 2}>Other tasks</th></tr>
                  ) : null,
                  <tr key={r.id}>
                    <th scope="row" className={r.type === "task" ? "raci-row-head raci-row-task" : "raci-row-head"}>
                      {r.title}
                      <span className="raci-row-type">{TYPE_LABEL[r.type] ?? r.type}</span>
                      {r.type === "task" && (
                        <button type="button" className="btn-link btn-link-danger raci-remove no-print" onClick={() => removeTask(r.id, r.title)}>Remove row</button>
                      )}
                    </th>
                    {data.people.map((p) => {
                      const role = cells.get(`${r.id}|${p.key}`) ?? null;
                      return (
                        <td key={p.key} className={role ? `raci-cell raci-${role}` : "raci-cell"}>
                          <button
                            type="button"
                            className="raci-btn"
                            onClick={() => cycle(r.id, p.key, role)}
                            aria-label={`${r.title}, ${p.name}: ${role ? RACI_ROLE_LABEL[role] : "not assigned"}. Click to change.`}
                          >
                            {role ?? ""}
                          </button>
                        </td>
                      );
                    })}
                    <td className="raci-warn no-print">
                      {warnings.map((w) => (
                        <span key={w} className={w === "empty" ? "raci-note muted" : "raci-note raci-note-warn"}>{ROW_WARNING_TEXT[w]}</span>
                      ))}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      <ul className="raci-legend" style={{ marginTop: 16 }}>
        {RACI_LEGEND.map((l) => (
          <li key={l.role}><span className={`raci-key raci-${l.role}`}>{l.role}</span> {l.text}</li>
        ))}
      </ul>
    </div>
  );
}
