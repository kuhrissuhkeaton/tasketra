// Starting column widths for a resizable table.
//
// `rendered` is how wide each column came out under the browser's normal
// automatic layout, `mins` is the least each column may have (its header label
// on one line, and never narrower than the table's minimum), and `available`
// is the width of the box the table sits in.
//
// A column that came out narrower than its minimum is raised to it. If that
// pushes the total past `available`, the excess is taken back from columns that
// have room above their own minimum, in proportion to how much room they have.
// So a table whose minimums fit always fits, and only a table that truly can't
// fit (minimums alone exceed the box) is left wider than its container and
// scrolls sideways.
export function fitColumns(rendered: number[], mins: number[], available: number): number[] {
  const widths = rendered.map((w, i) => Math.max(Math.floor(w), mins[i]));
  const total = widths.reduce((sum, w) => sum + w, 0);
  const excess = total - Math.floor(available);
  if (excess <= 0) return widths;

  const room = widths.map((w, i) => w - mins[i]);
  const totalRoom = room.reduce((sum, r) => sum + r, 0);
  if (totalRoom <= 0) return widths;

  const take = Math.min(excess, totalRoom);
  const cut = room.map((r) => Math.floor((take * r) / totalRoom));
  // Hand out the pixels lost to rounding, one at a time, to columns that still have room.
  let remainder = take - cut.reduce((sum, c) => sum + c, 0);
  for (let i = 0; remainder > 0 && i < widths.length * 2; i++) {
    const index = i % widths.length;
    if (cut[index] < room[index]) {
      cut[index] += 1;
      remainder -= 1;
    }
  }
  return widths.map((w, i) => w - cut[i]);
}

// Re-fits columns that were already sized when their container's width
// changes afterwards (a page scrollbar appearing, the window or a side panel
// resizing). Narrower: take the excess back the same way fitColumns does, so
// a table that fits never scrolls sideways. Wider: share the extra width out
// in proportion to the current widths so the table keeps filling its box.
// Never goes below a column's minimum, never exceeds `available` unless the
// minimums alone do not fit.
export function refitColumns(current: number[], mins: number[], available: number): number[] {
  const target = Math.floor(available);
  const total = current.reduce((sum, w) => sum + w, 0);
  if (total > target) return fitColumns(current, mins, target);
  if (total === target || total <= 0) return current.slice();
  const extra = target - total;
  const grown = current.map((w) => w + Math.floor((extra * w) / total));
  const lost = target - grown.reduce((sum, w) => sum + w, 0);
  if (lost > 0) grown[0] += lost;
  return grown;
}
