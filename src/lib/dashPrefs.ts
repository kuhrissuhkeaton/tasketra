import { useEffect, useState } from "react";

// Dashboard section open/closed preferences. Remembered per section and per screen size
// (a section you open on a phone doesn't force itself open on a desktop). Every storage
// access is wrapped so private mode or blocked storage just falls back to the defaults.

export const WIDE_QUERY = "(min-width: 861px)";

export function prefKey(id: string, wide: boolean): string {
  return `tasketra.dash.${id}.${wide ? "wide" : "narrow"}`;
}

export function readPref(key: string): boolean | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writePref(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
}

export function useIsWide(): boolean {
  const read = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY).matches : true);
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(WIDE_QUERY);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return wide;
}
