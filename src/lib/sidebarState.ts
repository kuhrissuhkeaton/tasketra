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

// v151 (Part E1): nav-group collapse is remembered per group label, so a
// group the user closed stays closed -- and one they never touched starts
// from its default. Returns null when nothing was stored.
const NAV_GROUP_KEY = "tasketra.navGroupCollapsed.";

export function readNavGroupCollapsed(label: string): boolean | null {
  try {
    const v = window.localStorage.getItem(NAV_GROUP_KEY + label);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

export function writeNavGroupCollapsed(label: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(NAV_GROUP_KEY + label, collapsed ? "1" : "0");
  } catch {
    // Not remembering the choice is fine.
  }
}
