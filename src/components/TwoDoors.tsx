// v171 "Two Doors": the choice shown when a project is created, replacing
// the size x approach jargon picker at the user's most fragile moment.
// One question, two doors, plain words. The full picker (Light / Standard /
// Full x Predictive / Hybrid / Agile) still lives in project settings,
// where Standard remains reachable; nothing about the size system changes.
//
// The last door a person picked is remembered (localStorage) and
// pre-selected next time, so a returning creator is one tap from done.

export type ProjectRoute = "simple" | "full";

const ROUTE_KEY = "tasketra:lastRoute";

export function lastRoute(): ProjectRoute {
  try {
    return localStorage.getItem(ROUTE_KEY) === "full" ? "full" : "simple";
  } catch {
    return "simple";
  }
}

export function rememberRoute(route: ProjectRoute): void {
  try {
    localStorage.setItem(ROUTE_KEY, route);
  } catch {
    /* storage unavailable (private mode); the default stands */
  }
}

export default function TwoDoorsPicker({
  value,
  onChange,
}: {
  value: ProjectRoute;
  onChange: (route: ProjectRoute) => void;
}) {
  return (
    <div className="doors">
      <p className="doors-q" id="doors-q">How do you want to run this project?</p>
      <div className="doors-grid" role="radiogroup" aria-labelledby="doors-q">
        <label className={value === "simple" ? "door-card door-card-on" : "door-card"}>
          <input
            type="radio"
            name="project-route"
            className="sr-only"
            checked={value === "simple"}
            onChange={() => onChange("simple")}
          />
          <span className="door-name">Keep it simple</span>
          <span className="door-blurb">Tasks, timeline, and decisions. Nothing else in your way.</span>
          <span className="door-tag">Most people start here</span>
        </label>
        <label className={value === "full" ? "door-card door-card-on" : "door-card"}>
          <input
            type="radio"
            name="project-route"
            className="sr-only"
            checked={value === "full"}
            onChange={() => onChange("full")}
          />
          <span className="door-name">Full project track</span>
          <span className="door-blurb">Charter, stakeholders, change control, and the complete structure.</span>
        </label>
      </div>
      <p className="doors-note">You can switch anytime.</p>
    </div>
  );
}
