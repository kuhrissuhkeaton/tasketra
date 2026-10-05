// Custom events for Plausible, which index.html already loads (see
// public/plausible-init.js). The init shim queues calls made before the
// script arrives; if Plausible is blocked or missing entirely, track() does
// nothing. Events only show up in Plausible once a matching goal exists.

export type AnalyticsEvent =
  | "signup_started"
  | "signup_completed"
  | "template_chosen"
  | "first_task_edited"
  | "three_tasks_added"
  | "teammate_invited";

type Plausible = (event: string, options?: { props?: Record<string, string> }) => void;

export function track(event: AnalyticsEvent, props?: Record<string, string>): void {
  try {
    const plausible = (window as unknown as { plausible?: Plausible }).plausible;
    if (typeof plausible === "function") plausible(event, props ? { props } : undefined);
  } catch {
    // Analytics must never break the app.
  }
}
