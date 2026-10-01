import type { RaciPerson, RaciRow } from "../lib/api";
import { RACI_LEGEND, cellMap, rowHeadLabel, startsOtherTasks, type RaciAssignment } from "../lib/raci";

const TYPE_LABEL: Record<string, string> = { phase: "Phase", milestone: "Milestone", task: "Task" };

/** The printable RACI chart. Used by the signed-in print page and the public share page. */
export function RaciDocument({
  projectName, rows, people, assignments, dateLabel,
}: { projectName: string; rows: RaciRow[]; people: RaciPerson[]; assignments: RaciAssignment[]; dateLabel: string }) {
  const cells = cellMap(assignments);
  return (
    <article className="risk-doc raci-doc">
      <header className="risk-doc-head">
        <p className="muted risk-doc-kicker">RACI chart</p>
        <h1>{projectName}</h1>
        <p className="muted">{dateLabel}</p>
      </header>
      <section>
        <h2>Who does what</h2>
        {rows.length === 0 || people.length === 0 ? (
          <p className="muted">Nothing to show yet. A RACI needs at least one phase or milestone and one person.</p>
        ) : (
          <div className="raci-scroll">
            <table className="raci-table">
              <thead>
                <tr>
                  <th className="raci-row-head">{rowHeadLabel(rows)}</th>
                  {people.map((p) => (
                    <th key={p.key} className="raci-col-head">
                      <span className="raci-person">{p.name}</span>
                      {p.role && <span className="raci-person-role">{p.role}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((r, i) => [
                  startsOtherTasks(rows, i) ? (
                    <tr key={`${r.id}-group`} className="raci-group"><th colSpan={people.length + 1}>Other tasks</th></tr>
                  ) : null,
                  <tr key={r.id}>
                    <th scope="row" className={r.type === "task" ? "raci-row-head raci-row-task" : "raci-row-head"}>
                      {r.title}
                      <span className="raci-row-type">{TYPE_LABEL[r.type] ?? r.type}</span>
                    </th>
                    {people.map((p) => {
                      const role = cells.get(`${r.id}|${p.key}`);
                      return <td key={p.key} className={role ? `raci-cell raci-${role}` : "raci-cell"}>{role ?? ""}</td>;
                    })}
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2>Key</h2>
        <ul className="raci-legend">
          {RACI_LEGEND.map((l) => (
            <li key={l.role}><span className={`raci-key raci-${l.role}`}>{l.role}</span> {l.text}</li>
          ))}
        </ul>
        <p className="muted risk-doc-note">Each row should have exactly one Accountable person.</p>
      </section>
    </article>
  );
}
