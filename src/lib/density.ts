// v172 (Plan A, "Layer It"): display density, borrowed from Plan B at Kk's
// direction. One preference, two values: "comfortable" (the calm default,
// generous spacing) and "compact" (tighter rows and cards for people
// working a big register). Stored per device in localStorage, applied as
// a data-density attribute on <html>; the CSS does the rest, so every
// layered surface responds without knowing the preference exists.

export type Density = "comfortable" | "compact";

const KEY = "tasketra:density";
export const DEFAULT_DENSITY: Density = "comfortable";

export function readDensity(): Density {
  try {
    return window.localStorage.getItem(KEY) === "compact" ? "compact" : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function applyDensity(d: Density): void {
  try {
    document.documentElement.dataset.density = d;
  } catch {
    // no document (tests, SSR): nothing to apply to
  }
}

export function writeDensity(d: Density): void {
  try {
    window.localStorage.setItem(KEY, d);
  } catch {
    // private mode etc.: the attribute still applies for this session
  }
  applyDensity(d);
  listeners.forEach((fn) => fn(d));
}

/** Apply the stored preference. Called once at startup from main.tsx. */
export function initDensity(): Density {
  const d = readDensity();
  applyDensity(d);
  return d;
}

const listeners = new Set<(d: Density) => void>();

export function subscribeDensity(fn: (d: Density) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
