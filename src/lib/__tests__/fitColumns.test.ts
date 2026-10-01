import { describe, it, expect } from "vitest";
import { fitColumns } from "../fitColumns";

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe("fitColumns", () => {
  it("leaves columns alone when they already fit", () => {
    expect(fitColumns([300, 200, 380], [100, 80, 90], 880)).toEqual([300, 200, 380]);
  });

  it("floors fractional rendered widths so rounding never adds a stray pixel", () => {
    const out = fitColumns([110.6, 110.6, 110.6, 110.6, 110.6, 110.6, 110.6, 110.6], [60, 60, 60, 60, 60, 60, 60, 60], 884);
    expect(out).toEqual(Array(8).fill(110));
    expect(sum(out)).toBeLessThanOrEqual(884);
  });

  it("raises a squeezed column to its minimum and takes the excess from roomier ones", () => {
    // Column 0 was squeezed to 40 but its label needs 90; columns 1 and 2 have room.
    const out = fitColumns([40, 300, 540], [90, 100, 100], 880);
    expect(out[0]).toBe(90);
    expect(sum(out)).toBe(880);
    expect(out[1]).toBeGreaterThanOrEqual(100);
    expect(out[2]).toBeGreaterThanOrEqual(100);
  });

  it("never takes a column below its minimum", () => {
    const mins = [120, 90, 90, 64];
    const out = fitColumns([60, 200, 300, 320], mins, 700);
    out.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(mins[i]));
    expect(sum(out)).toBe(700);
  });

  it("leaves the table wider than its box only when the minimums alone do not fit", () => {
    const out = fitColumns([100, 100, 100], [200, 200, 200], 500);
    expect(out).toEqual([200, 200, 200]);
    expect(sum(out)).toBeGreaterThan(500);
  });

  it("takes the excess in proportion to each column's spare room", () => {
    // Spare room 300 and 100; excess 80 -> cut 60 and 20.
    expect(fitColumns([400, 200], [100, 100], 520)).toEqual([340, 180]);
  });
});

import { refitColumns } from "../fitColumns";

describe("refitColumns", () => {
  const mins = [100, 80, 64];

  it("is a no-op when the width is unchanged", () => {
    expect(refitColumns([300, 200, 300], mins, 800)).toEqual([300, 200, 300]);
  });

  it("shrinks to a narrower box so nothing scrolls (a 15px scrollbar appears)", () => {
    const out = refitColumns([300, 200, 300], mins, 785);
    expect(sum(out)).toBe(785);
    out.forEach((w, i) => expect(w).toBeGreaterThanOrEqual(mins[i]));
  });

  it("grows into a wider box in proportion, filling it exactly", () => {
    const out = refitColumns([300, 200, 300], mins, 1000);
    expect(sum(out)).toBe(1000);
    expect(out[0]).toBeGreaterThan(300);
    expect(out[1]).toBeGreaterThan(200);
  });

  it("never goes below a minimum, even when the box is tiny", () => {
    const out = refitColumns([300, 200, 300], mins, 100);
    expect(out).toEqual([100, 80, 64]);
  });

  it("round trips: shrink then grow back returns to the box width", () => {
    const small = refitColumns([300, 200, 300], mins, 785);
    expect(sum(refitColumns(small, mins, 800))).toBe(800);
  });
});
