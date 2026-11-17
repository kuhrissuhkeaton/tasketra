import { fmtLocalDate } from "./format";

// The decision lead line (v164): the words every surface puts first on an
// open decision -- who it is waiting on, how long it has waited, and when
// it is needed by. The phrasing is the v160 per-project card's, verbatim,
// so the Dashboard's Waiting Longest list, the cross-project Decisions
// view and the project page all read the same: "Waiting on Sam Rivera ·
// waiting 5 days · Needed by Nov 20, 2026". A request sent to nobody yet
// says so and names the action that starts the wait.
export function decisionWaitWords(createdAt: string, now: Date = new Date()): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86400000));
  return days === 0 ? "asked today" : `waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** The full lead line as one string (for compact list rows). Surfaces that
 *  can render markup bold the recipient names themselves, as the v160
 *  card does; the words are identical either way. */
export function decisionLeadLine(d: { recipients: string[]; createdAt: string; deadline: string | null }, now: Date = new Date()): string {
  const who = d.recipients.length
    ? `Waiting on ${d.recipients.join(", ")} · ${decisionWaitWords(d.createdAt, now)}`
    : "Not sent to anyone yet — copy the link to ask.";
  return d.deadline ? `${who} · Needed by ${fmtLocalDate(d.deadline)}` : who;
}
