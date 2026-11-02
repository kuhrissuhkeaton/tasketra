/**
 * Tells screen-reader users that something happened ("Risk added.",
 * "Deleted.") without moving focus. The polite live region lives on
 * <body>, outside React, so it survives a tab or form re-rendering and
 * is already in the page when the message is written (live regions are
 * only announced reliably if they exist before their text changes).
 */
const REGION_ID = "app-live-region";

function ensureRegion(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(REGION_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = REGION_ID;
    el.className = "sr-only";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }
  return el;
}

// Created as soon as the app loads, so it exists before the first message.
ensureRegion();

let clearTimer: number | undefined;

export function announce(message: string): void {
  const el = ensureRegion();
  if (!el) return;
  // Clear first so the same message twice in a row is still announced.
  el.textContent = "";
  window.clearTimeout(clearTimer);
  window.setTimeout(() => {
    el.textContent = message;
    // Don't leave the last message sitting in the region forever: the region
    // lives on <body> across every page, so an old "Project deleted." would
    // otherwise still be the most recent announcement on unrelated screens
    // minutes later. Clear it once it has had time to be read.
    window.clearTimeout(clearTimer);
    clearTimer = window.setTimeout(() => {
      el.textContent = "";
    }, 6000);
  }, 60);
}
