import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Tab } from "../pages/ProjectHome";

/**
 * The first-run product tour: a fixed sequence of spotlights over the real
 * project UI, in the order a PM actually works a project. Narration only --
 * nothing here requires the viewer to take an action to advance, and every
 * step is skippable. See the "data-tour" attributes on the tab buttons in
 * ProjectHome.tsx for where each step's target lives.
 */
export type TourStep = {
  target: string; // matches a data-tour="..." attribute
  tab: Tab; // which project tab must be showing for the target to exist
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    target: "tab-home",
    tab: "home",
    title: "Your command center",
    body: "What needs attention across the whole project shows up here first, not buried three clicks deep.",
  },
  {
    target: "tab-roadmap",
    tab: "roadmap",
    title: "Start with the shape of it",
    body: "Lay out phases and milestones before you get into individual tasks. This is the plan everything else hangs off of.",
  },
  {
    target: "tab-tasks",
    tab: "tasks",
    title: "The work itself",
    body: "Parent tasks, subtasks, owners, due dates. Built like a real WBS, not a flat to-do list.",
  },
  {
    target: "tab-raid",
    tab: "raid",
    title: "Where most PM tools stop, Tasketra doesn't",
    body: "Risks, assumptions, issues, and dependencies, tracked in one place. This is the stuff that derails a project, not the task list.",
  },
  {
    target: "tab-meetings",
    tab: "meetings",
    title: "Meetings that lead somewhere",
    body: "Log a meeting and capture action items right there. They flow straight into Tasks, so nothing lives only in someone's notes.",
  },
  {
    target: "tab-decisions",
    tab: "decisions",
    title: "A record for every decision",
    body: "Every decision gets logged, with a shareable link so a stakeholder can see it without logging in.",
  },
  {
    target: "tab-budget",
    tab: "budget",
    title: "Cost, tracked as you go",
    body: "See spend against plan in real time, not just when the month closes.",
  },
  {
    target: "tab-team",
    tab: "team",
    title: "Bring the team in",
    body: "Invite whoever else touches this project. Everyone works off the same picture.",
  },
  {
    target: "tab-templates",
    tab: "templates",
    title: "A head start when you need one",
    body: "Project charter, risk register, and RACI templates, ready to drop in.",
  },
  {
    target: "tab-home",
    tab: "home",
    title: "That's the whole picture",
    body: "You're one of our first users. If something's missing or clunky, tell me, I'm building this around what you need.",
  },
];

export function useProductTour(onStepTab: (tab: Tab) => void) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const finish = useCallback(() => {
    setActive(false);
    api.completeTour().catch(() => {
      // Best-effort -- if this fails the tour just won't auto-suppress next
      // time, which is a minor annoyance, not worth surfacing an error for.
    });
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    onStepTab(TOUR_STEPS[0].tab);
  }, [onStepTab]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      const nextIndex = i + 1;
      if (nextIndex >= TOUR_STEPS.length) {
        finish();
        return i;
      }
      onStepTab(TOUR_STEPS[nextIndex].tab);
      return nextIndex;
    });
  }, [finish, onStepTab]);

  return { active, step: TOUR_STEPS[stepIndex], stepIndex, totalSteps: TOUR_STEPS.length, start, next, skip: finish };
}

type Rect = { top: number; left: number; width: number; height: number };

export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function measure() {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el || cancelled) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    // Give scrollIntoView a moment to settle before measuring, and again
    // shortly after in case the smooth scroll is still animating.
    const t1 = window.setTimeout(measure, 60);
    const t2 = window.setTimeout(measure, 300);

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  const pad = 6;
  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 10,
        border: "2px solid var(--gold)",
        boxShadow: "0 0 0 9999px rgba(28, 36, 21, 0.6)",
        zIndex: 9999,
        pointerEvents: "none",
        transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
      }
    : { position: "fixed", inset: 0, background: "rgba(28, 36, 21, 0.6)", zIndex: 9999, pointerEvents: "none" };

  // Prefer placing the tooltip below the target; flip above if there isn't
  // room, and clamp horizontally so it never runs off either edge.
  const tooltipWidth = 320;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  let tooltipTop = rect ? rect.top + rect.height + pad + 12 : viewportH / 2 - 80;
  let tooltipLeft = rect ? rect.left : viewportW / 2 - tooltipWidth / 2;
  const estimatedTooltipHeight = 190;
  if (rect && tooltipTop + estimatedTooltipHeight > viewportH - 16) {
    tooltipTop = Math.max(16, rect.top - estimatedTooltipHeight - 12);
  }
  tooltipLeft = Math.min(Math.max(16, tooltipLeft), viewportW - tooltipWidth - 16);

  return (
    <>
      <div style={spotlightStyle} aria-hidden="true" />
      <div
        ref={tooltipRef}
        className="tour-tooltip"
        style={{ position: "fixed", top: tooltipTop, left: tooltipLeft, width: tooltipWidth, zIndex: 10000 }}
        role="dialog"
        aria-label="Product tour"
      >
        <div className="tour-tooltip-step">Step {stepIndex + 1} of {totalSteps}</div>
        <h3 className="tour-tooltip-title">{step.title}</h3>
        <p className="tour-tooltip-body">{step.body}</p>
        <div className="tour-tooltip-footer">
          <button type="button" className="btn btn-ghost" onClick={onSkip}>
            Skip tour
          </button>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {stepIndex + 1 === totalSteps ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
