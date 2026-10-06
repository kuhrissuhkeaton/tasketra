const KEY = "tasketra.sidebarCollapsed";

/** Whether the user last left the desktop sidebar collapsed to its icon rail.
 *  Storage can be unavailable (private windows, blocked site data), so every
 *  access is wrapped and the sidebar simply defaults to expanded. */
export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Not remembering the choice is fine.
  }
}
