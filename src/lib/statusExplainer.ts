// The stated-vs-evidence explainer (v159, F-03): a one-line explanation of
// the status model, shown at a user's first encounter with a stated status
// that disagrees with the evidence, dismissible, and remembered per user.
// There is no per-user settings store on the server (see firstRun.ts), so
// the dismissal lives in this browser's storage keyed by user id, exactly
// like the first-run checklist.

const storageKey = (userId: string) => `tasketra:status-explainer-dismissed:${userId}`;

export function readStatusExplainerDismissed(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissStatusExplainer(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), "1");
  } catch {
    // Storage unavailable: the line simply shows again next time.
  }
}

export const STATUS_EXPLAINER_TEXT =
  "Your call leads. Evidence is what the numbers say; when they disagree, both show.";
