import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PortfolioProjectSummary } from "../lib/api";
import {
  gettingStartedItems,
  latchGettingStarted,
  readGettingStarted,
  setGettingStartedDismissed,
  type GettingStartedState,
} from "../lib/gettingStarted";

// v161 (F-07): the getting-started checklist on Today. Five firsts, each
// filled from real actions (live signals from the portfolio Today already
// loads, plus two one-shot fetches for decisions and members), latched so
// a step never unticks when its evidence scrolls away. Dismissible, and
// resumable from a slim progress line -- dismissing is a pause, not a
// delete.
export function GettingStartedCard({ userId, projects }: { userId: string; projects: PortfolioProjectSummary[] }) {
  const [state, setState] = useState<GettingStartedState>(() => readGettingStarted(userId));

  const first = projects[0];
  const anyTasks = projects.some((p) => p.totalTasks > 0);
  const anyCheckin = projects.some((p) => p.statedAt != null);

  // Latch the steps whose live signal is already visible, so they stay
  // ticked even if the underlying item is later removed.
  useEffect(() => {
    if (anyTasks && latchGettingStarted(userId, "task")) setState(readGettingStarted(userId));
    if (anyCheckin && latchGettingStarted(userId, "checkin")) setState(readGettingStarted(userId));
  }, [userId, anyTasks, anyCheckin]);

  // "Decision sent": an open ask on the weekly sync means a decision is
  // out with someone. One fetch, latched on a positive.
  useEffect(() => {
    if (state.decision || projects.length === 0) return;
    let live = true;
    api
      .getWeeklySync()
      .then((d) => {
        if (live && d.asks.length > 0 && latchGettingStarted(userId, "decision")) {
          setState(readGettingStarted(userId));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, state.decision, projects.length]);

  // "Teammate invited": any member row on the first project.
  useEffect(() => {
    if (state.invite || !first) return;
    let live = true;
    api
      .listMembers(first.id)
      .then((d) => {
        if (live && d.members.length > 0 && latchGettingStarted(userId, "invite")) {
          setState(readGettingStarted(userId));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, state.invite, first]);

  if (!first) return null;

  const items = gettingStartedItems(state, {
    hasProject: true,
    anyTasks,
    anyOpenDecision: false, // folded into the latch by the fetch above
    anyCheckin,
    hasTeammate: false, // folded into the latch by the fetch above
  });

  if (state.dismissed) {
    if (items.complete) return null;
    return (
      <div className="getting-started-slim">
        <span>
          Getting started · {items.doneCount} of 5 done
        </span>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            setGettingStartedDismissed(userId, false);
            setState(readGettingStarted(userId));
          }}
        >
          Keep going
        </button>
      </div>
    );
  }

  const rows: { key: string; label: string; hint: string; done: boolean; to?: string; action?: string }[] = [
    { key: "project", label: "Start your first project", hint: "Done -- you're looking at it.", done: items.project },
    {
      key: "task",
      label: "Add a task",
      hint: "The first real thing that needs doing.",
      done: items.task,
      to: `/app/projects/${first.id}?tab=tasks`,
      action: "Add one",
    },
    {
      key: "decision",
      label: "Send a decision",
      hint: "Ask someone to decide, with a link they can answer without an account.",
      done: items.decision,
      to: `/app/projects/${first.id}?tab=decisions`,
      action: "Send one",
    },
    {
      key: "checkin",
      label: "Post a check-in",
      hint: "One line on how it's going.",
      done: items.checkin,
      to: `/app/projects/${first.id}?tab=home`,
      action: "Write one",
    },
    {
      key: "invite",
      label: "Invite a teammate",
      hint: "Tasketra gets better with a second person in it.",
      done: items.invite,
      to: `/app/projects/${first.id}?tab=team`,
      action: "Invite",
    },
  ];

  return (
    <section className="first-run-checklist getting-started" aria-label="Getting started checklist">
      <div className="first-run-checklist-head">
        <h2>Getting started</h2>
        <span className="doing-tour-progress">
          {items.doneCount} of 5
          <button
            type="button"
            className="hub-tip-close"
            aria-label="Dismiss the getting-started checklist"
            onClick={() => {
              setGettingStartedDismissed(userId, true);
              setState(readGettingStarted(userId));
            }}
          >
            ×
          </button>
        </span>
      </div>
      {items.complete ? (
        <p className="doing-tour-done">
          All five done -- project, task, decision, check-in, and a teammate. You're set up.
        </p>
      ) : (
        <ol className="first-run-steps">
          {rows.map((row) => (
            <li key={row.key} className={row.done ? "done" : undefined}>
              <span className="first-run-step-mark" aria-hidden="true">
                {row.done ? "✓" : "·"}
              </span>
              <span className="first-run-step">{row.label}</span>
              {row.done ? (
                <span className="first-run-step-detail">Done</span>
              ) : (
                <>
                  {row.to && (
                    <Link className="btn btn-small doing-tour-action" to={row.to}>
                      {row.action}
                    </Link>
                  )}
                  <span className="doing-tour-hint">{row.hint}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
