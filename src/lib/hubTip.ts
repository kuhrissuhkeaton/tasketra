// The Dashboard's "new here? see how a project runs" tip. It only helps people
// still finding their feet, so it shows for the first couple of projects, never
// while the list is still loading (it would flash and vanish), and never once
// dismissed. Pure so the rule can be tested; storage is handled by the page.

export const HUB_TIP_MAX_PROJECTS = 2;
export const HUB_TIP_STORAGE_KEY = "tasketra:hub-tip-dismissed";

export function shouldShowHubTip(opts: { loading: boolean; projectCount: number; dismissed: boolean }): boolean {
  if (opts.loading || opts.dismissed) return false;
  return opts.projectCount <= HUB_TIP_MAX_PROJECTS;
}
