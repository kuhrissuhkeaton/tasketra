import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { STATUS_EXPLAINER_TEXT, dismissStatusExplainer, readStatusExplainerDismissed } from "../lib/statusExplainer";

/**
 * The one-line stated-vs-evidence explainer (v159, F-03). Surfaces render
 * it where a stated status first meets a disagreeing evidence line; it
 * dismisses forever (per user, per browser) from the ×.
 */
export function StatusExplainer() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(() => readStatusExplainerDismissed(user?.id));
  if (dismissed) return null;
  return (
    <p className="status-explainer" role="note">
      <span>{STATUS_EXPLAINER_TEXT}</span>
      <button
        type="button"
        className="status-explainer-close"
        aria-label="Dismiss this explanation"
        onClick={() => {
          dismissStatusExplainer(user?.id);
          setDismissed(true);
        }}
      >
        ×
      </button>
    </p>
  );
}
