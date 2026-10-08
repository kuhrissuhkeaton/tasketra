// Dark mode (v99, quick win #4). Same storage-defensiveness pattern as
// sidebarState.ts: every localStorage access is wrapped, so a private
// window or blocked site data just means the choice isn't remembered,
// never a crash.
//
// "system" (the default) means no explicit choice -- the CSS in
// index.css follows prefers-color-scheme on its own, and this module
// has nothing to apply. "light" or "dark" is an explicit override: it's
// written to localStorage and applied as a data-theme attribute on
// <html>, which the dark-mode CSS block checks (and which wins over the
// OS preference either way, including overriding prefers-color-scheme:
// dark back to light).

const KEY = "tasketra.theme";
export type Theme = "light" | "dark" | "system";

export function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    if (theme === "system") {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, theme);
    }
  } catch {
    // Not remembering the choice is fine -- it just resets to System next visit.
  }
}
