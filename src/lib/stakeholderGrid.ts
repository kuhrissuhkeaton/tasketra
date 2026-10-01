// The Power / Interest grid. Power is how much influence a stakeholder has over
// the project; interest is how much they care about it. Pure functions, shared
// by the Stakeholders tab, the printable page and the Resource hub guide, so
// the four strategies are written in exactly one place.

export type Level = "low" | "medium" | "high";
export type QuadrantId = "manage_closely" | "keep_satisfied" | "keep_informed" | "monitor";

export type GridQuadrant = { id: QuadrantId; name: string; axis: string; strategy: string };

export const STAKEHOLDER_QUADRANTS: GridQuadrant[] = [
  { id: "manage_closely", name: "Manage closely", axis: "High power, high interest", strategy: "Your key players. Involve them in decisions, brief them first, and never let them be surprised by news." },
  { id: "keep_satisfied", name: "Keep satisfied", axis: "High power, low interest", strategy: "Keep them content with outcomes, not details. Enough information that they stay supportive without needing a play-by-play." },
  { id: "keep_informed", name: "Keep informed", axis: "Low power, high interest", strategy: "They care and can influence opinion even without formal authority. Regular updates keep them as allies, not surprises." },
  { id: "monitor", name: "Monitor", axis: "Low power, low interest", strategy: "Minimal effort -- a periodic check-in is enough. Watch for movement into another quadrant as the project evolves." },
];

/**
 * Medium counts as the higher side. Someone you are unsure about is better
 * engaged than ignored, and it keeps the grid to the four classic boxes.
 * Returns null when either value is missing: we never guess a placement.
 */
export function quadrantOf(power: Level | null | undefined, interest: Level | null | undefined): QuadrantId | null {
  if (!power || !interest) return null;
  const highPower = power !== "low";
  const highInterest = interest !== "low";
  if (highPower) return highInterest ? "manage_closely" : "keep_satisfied";
  return highInterest ? "keep_informed" : "monitor";
}

export type Placeable = { power_level: Level | null; interest_level: Level | null };

export function placeStakeholders<T extends Placeable>(list: T[]): { byQuadrant: Record<QuadrantId, T[]>; unplaced: T[] } {
  const byQuadrant: Record<QuadrantId, T[]> = { manage_closely: [], keep_satisfied: [], keep_informed: [], monitor: [] };
  const unplaced: T[] = [];
  for (const s of list) {
    const q = quadrantOf(s.power_level, s.interest_level);
    if (q) byQuadrant[q].push(s);
    else unplaced.push(s);
  }
  return { byQuadrant, unplaced };
}
