import { useState, type KeyboardEvent } from "react";
import { GUIDE_STAGES, GUIDE_PRINCIPLE, type GuideStage } from "../lib/hubGuide";
import { SIZE_LABEL, SIZE_BLURB, APPROACH_LABEL, APPROACH_BLURB, type ProjectSize, type ProjectApproach } from "../lib/projectView";

/**
 * The Resource hub's "how a project runs" guide. One stage is open at a time:
 * pick Initiate, Plan, Execute or Close and read just that stage, instead of
 * four dense cards at once. `stages` is the (possibly search-filtered) list.
 */
export function ProjectFlowGuide({ stages }: { stages: GuideStage[] }) {
  const [selected, setSelected] = useState<GuideStage["id"]>("initiate");
  if (stages.length === 0) return null;
  const active = stages.find((s) => s.id === selected) ?? stages[0];
  const activeIndex = stages.indexOf(active);
  const next = stages[activeIndex + 1];

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let to = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (index + 1) % stages.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (index - 1 + stages.length) % stages.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = stages.length - 1;
    else return;
    e.preventDefault();
    setSelected(stages[to].id);
    document.getElementById(`flow-tab-${stages[to].id}`)?.focus();
  }

  return (
    <div className="flow-guide">
      <div className="flow-stages" role="tablist" aria-label="Project stages">
        {stages.map((st, i) => {
          const on = st.id === active.id;
          return (
            <button
              key={st.id}
              id={`flow-tab-${st.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="flow-panel"
              tabIndex={on ? 0 : -1}
              className={on ? "flow-stage flow-stage-on" : "flow-stage"}
              onClick={() => setSelected(st.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className="flow-num" aria-hidden="true">{GUIDE_STAGES.findIndex((g) => g.id === st.id) + 1}</span>
              <span className="flow-name">{st.name}</span>
              <span className="flow-short">{st.short}</span>
            </button>
          );
        })}
      </div>

      <div className="flow-panel" id="flow-panel" role="tabpanel" aria-labelledby={`flow-tab-${active.id}`}>
        <p className="flow-goal">{active.goal}</p>
        <ol className="flow-steps">
          {active.steps.map((step) => (
            <li key={step.title}>
              <span className="flow-where">{step.tab}</span>
              <div>
                <strong>{step.title}</strong>
                <p>
                  {step.why}
                  {step.lightHides && <span className="flow-note"> Hidden on Light projects unless you show all tabs.</span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flow-foot">
          <p className="flow-checklist"><strong>Home checklist:</strong> {active.checklist}</p>
          {next && (
            <button type="button" className="btn btn-ghost flow-next" onClick={() => setSelected(next.id)}>
              Next: {next.name}
            </button>
          )}
        </div>
      </div>

      <details className="flow-setup">
        <summary>Two choices when you create a project: size and approach</summary>
        <div className="flow-setup-grid">
          <div>
            <h5>Size: how much structure</h5>
            <dl>
              {(Object.keys(SIZE_LABEL) as ProjectSize[]).map((k) => (
                <div key={k}><dt>{SIZE_LABEL[k]}</dt><dd>{SIZE_BLURB[k]}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h5>Approach: how the work runs</h5>
            <dl>
              {(Object.keys(APPROACH_LABEL) as ProjectApproach[]).map((k) => (
                <div key={k}><dt>{APPROACH_LABEL[k]}</dt><dd>{APPROACH_BLURB[k]}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </details>
      <p className="flow-principle">{GUIDE_PRINCIPLE}</p>
    </div>
  );
}
