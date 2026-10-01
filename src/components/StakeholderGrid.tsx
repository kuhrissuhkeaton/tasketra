import type { Stakeholder } from "../lib/api";
import { STAKEHOLDER_QUADRANTS, placeStakeholders, type QuadrantId } from "../lib/stakeholderGrid";

type Person = Pick<Stakeholder, "id" | "name" | "role" | "power_level" | "interest_level">;

// Rows are power (high on top), columns are interest (high on the right).
const LAYOUT: QuadrantId[] = ["keep_satisfied", "manage_closely", "monitor", "keep_informed"];

/** The live Power / Interest grid. Used by the Stakeholders tab and the printable page. */
export function StakeholderGrid({ stakeholders, showStrategy = true }: { stakeholders: Person[]; showStrategy?: boolean }) {
  const { byQuadrant, unplaced } = placeStakeholders(stakeholders);
  return (
    <div className="sh-grid-wrap">
      <div className="sh-grid" role="group" aria-label="Stakeholder power and interest grid">
        <span className="sh-axis sh-axis-y">Power (influence) →</span>
        {LAYOUT.map((id) => {
          const q = STAKEHOLDER_QUADRANTS.find((x) => x.id === id)!;
          const people = byQuadrant[id];
          return (
            <section key={id} className={`sh-quad sh-quad-${id}`} aria-label={q.name}>
              <h4>{q.name} <span className="sh-count">{people.length}</span></h4>
              <p className="sh-axis-note">{q.axis}</p>
              {showStrategy && <p className="sh-strategy">{q.strategy}</p>}
              {people.length === 0 ? (
                <p className="muted sh-empty">No one here yet.</p>
              ) : (
                <ul>
                  {people.map((p) => (
                    <li key={p.id}>
                      <strong>{p.name}</strong>
                      {p.role && <span className="muted"> · {p.role}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <span className="sh-axis sh-axis-x">Interest (how much they care) →</span>
      </div>
      <p className="muted sh-note">Medium counts as the higher side, so anyone you are unsure about is engaged rather than ignored.</p>
      {unplaced.length > 0 && (
        <div className="sh-unplaced">
          <h4>Not placed yet ({unplaced.length})</h4>
          <p className="muted">Set both Power and Interest to place these people.</p>
          <ul>
            {unplaced.map((p) => <li key={p.id}>{p.name}{p.role && <span className="muted"> · {p.role}</span>}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
