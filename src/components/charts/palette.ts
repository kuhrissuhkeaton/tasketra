// The shared visual kit's categorical palette (v164, dashboard plan
// Phase 7). These colors mean "a different category", never "a different
// health" -- status meaning stays with the status colors (--chart-good /
// --chart-warn / --chart-crit and the pill pastels) everywhere in the app,
// so a donut slice can never be misread as a health verdict. The hues are
// deliberately muted and sit comfortably next to the Tasketra dark green
// and lime without borrowing either.
export const CATEGORICAL_PALETTE = [
  "#546A8A", // steel blue
  "#7D5BA6", // plum
  "#2E7D74", // teal
  "#B56545", // rust
  "#A8577E", // dusty pink
  "#6B7F59", // gray green
  "#8A6D3B", // ochre
  "#4A6FA5", // slate blue
] as const;

/** The categorical color for the i-th segment, wrapping if a chart ever
 *  has more categories than palette entries. */
export function categoricalColor(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}
