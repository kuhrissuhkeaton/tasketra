// v163 (Phase 6, the delight pack): the one Delight setting behind every
// easter egg in the app -- the four that shipped attached to their surfaces
// in v158/v159/v161 (Fully loaded register, Clean sweep, Clean sheet
// Monday, First word in.) and the seven that arrive with this release.
// The Account page's Delight toggle flips them ALL at once, per the expert
// panel review's rule; there is no per-egg setting.
//
// Storage is the per-user browser-storage pattern firstRun.ts established
// (there is no per-user server settings store, and a cosmetic preference
// needs none): keyed by user id, and only the OFF state is written -- an
// unset key reads as ON, which is the default. The two feed eggs (On the
// nose, Century) are the exception in shape only: their record is a real
// activity-log row written by the server when the moment happens, so the
// toggle's job for them is at read time -- the Feed hides egg rows while
// Delight is off (isEggFeedItem below). The rows themselves stay in the
// project's history, like everything else in the log.

import { useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import type { FeedItem } from "./api";

const KEY_PREFIX = "tasketra:delight:";

/** Fired on window when the setting flips, so mounted surfaces react at once. */
export const DELIGHT_EVENT = "tasketra:delight-changed";

export function readDelight(userId: string): boolean {
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${userId}`) !== "off";
  } catch {
    return true;
  }
}

export function writeDelight(userId: string, on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(`${KEY_PREFIX}${userId}`);
    else window.localStorage.setItem(`${KEY_PREFIX}${userId}`, "off");
  } catch {
    // Storage unavailable: the choice just doesn't persist; the event
    // below still flips every mounted surface for this visit.
  }
  try {
    window.dispatchEvent(new CustomEvent(DELIGHT_EVENT, { detail: { userId, on } }));
  } catch {
    // ignore -- the writer's own state already changed.
  }
}

/** The setting for the signed-in user, live-updating when it flips. */
export function useDelight(): { enabled: boolean; setEnabled: (on: boolean) => void } {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [enabled, setEnabledState] = useState<boolean>(() => (userId ? readDelight(userId) : true));

  useEffect(() => {
    if (userId) setEnabledState(readDelight(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onChange = () => setEnabledState(readDelight(userId));
    window.addEventListener(DELIGHT_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(DELIGHT_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [userId]);

  const setEnabled = (on: boolean) => {
    if (!userId) return;
    writeDelight(userId, on);
    setEnabledState(on);
  };

  return { enabled, setEnabled };
}

// --- Feed eggs (6 and 10) ---------------------------------------------------
// The exact activity summaries the server writes when these moments land
// (netlify/lib/delight.ts writes them; keep the two in step). The Feed
// recognizes its egg rows by these bodies so the toggle can hide them.

export const ON_THE_NOSE_BODY = "On the nose.";
export const CENTURY_BODY = "Century: 100 tasks done on this project.";

export function isEggFeedItem(item: Pick<FeedItem, "type" | "body">): boolean {
  return item.type === "activity" && (item.body === ON_THE_NOSE_BODY || item.body === CENTURY_BODY);
}

// --- Egg 7: answered within the hour ----------------------------------------

/**
 * Whole minutes between a decision request being sent and its first
 * answer, when that answer landed within the hour -- otherwise null.
 * A sub-minute answer reads as 1 (the card's line is "Answered in
 * {N} minutes"); anything at or past 61 minutes, unanswered, or with a
 * response timestamp at or before the request's earns no line.
 */
export function fastAnswerMinutes(createdAt: string, firstRespondedAt: string | null | undefined): number | null {
  if (!firstRespondedAt) return null;
  const ms = new Date(firstRespondedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0 || ms > 60 * 60 * 1000) return null;
  return Math.max(1, Math.floor(ms / 60000));
}
