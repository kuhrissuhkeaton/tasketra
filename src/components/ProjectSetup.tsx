import { useId } from "react";
import {
  SIZE_LABEL, SIZE_BLURB, APPROACH_LABEL, APPROACH_BLURB, hiddenTabLabels,
  type ProjectSize, type ProjectApproach,
} from "../lib/projectView";

const SIZES: ProjectSize[] = ["light", "standard", "full"];
const APPROACHES: ProjectApproach[] = ["predictive", "hybrid", "agile"];

/**
 * Size (how much structure) and approach (how the work runs) pickers. Used
 * when creating a project and again in a project's settings. Size only hides
 * tabs, never data, and the summary line always says exactly which.
 */
export function ProjectSetupPicker({
  size,
  approach,
  onChange,
  disabled,
}: {
  size: ProjectSize;
  approach: ProjectApproach;
  onChange: (next: { size: ProjectSize; approach: ProjectApproach }) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const hidden = hiddenTabLabels(size);

  return (
    <div className="setup-picker">
      <fieldset className="setup-group" disabled={disabled}>
        <legend className="setup-legend">How much structure does it need?</legend>
        <div className="setup-size-grid">
          {SIZES.map((s) => (
            <label key={s} className={size === s ? "setup-size-card setup-size-card-on" : "setup-size-card"}>
              <input
                type="radio"
                name={`${uid}-size`}
                className="sr-only"
                checked={size === s}
                onChange={() => onChange({ size: s, approach })}
              />
              <span className="setup-size-name">{SIZE_LABEL[s]}</span>
              <span className="setup-size-blurb">{SIZE_BLURB[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="setup-group" disabled={disabled}>
        <legend className="setup-legend">How will the work run?</legend>
        <div className="setup-seg">
          {APPROACHES.map((a) => (
            <label key={a} className={approach === a ? "setup-seg-item setup-seg-item-on" : "setup-seg-item"}>
              <input
                type="radio"
                name={`${uid}-approach`}
                className="sr-only"
                checked={approach === a}
                onChange={() => onChange({ size, approach: a })}
              />
              {APPROACH_LABEL[a]}
            </label>
          ))}
        </div>
        <p className="setup-note">{APPROACH_BLURB[approach]}</p>
      </fieldset>

      <p className="setup-summary">
        {hidden.length === 0
          ? "Every tab is shown."
          : `Hidden in ${SIZE_LABEL[size]}: ${hidden.join(", ")}. Nothing is deleted, and you can show all tabs any time in project settings.`}
      </p>
    </div>
  );
}
