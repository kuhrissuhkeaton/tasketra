import { describe, it, expect } from "vitest";
import { unseenWhatsNew, badgeText } from "../lib/notifications";
import type { ChangeEntry } from "../lib/whatsNewData";

const mk = (version: string): ChangeEntry => ({ version, date: "October 2026", title: `Title ${version}`, body: "x" });
const changes = [mk("v100"), mk("v99"), mk("v98")];

describe("unseenWhatsNew", () => {
  it("returns the entries newer than the last one seen, newest first", () => {
    expect(unseenWhatsNew(changes, "v98").map((c) => c.version)).toEqual(["v100", "v99"]);
    expect(unseenWhatsNew(changes, "v99").map((c) => c.version)).toEqual(["v100"]);
  });
  it("returns nothing when they have seen the latest", () => {
    expect(unseenWhatsNew(changes, "v100")).toEqual([]);
  });
  it("returns nothing when we do not know what they saw (new account, or an unknown version)", () => {
    expect(unseenWhatsNew(changes, null)).toEqual([]);
    expect(unseenWhatsNew(changes, undefined)).toEqual([]);
    expect(unseenWhatsNew(changes, "v7")).toEqual([]);
  });
});

describe("badgeText", () => {
  it("shows nothing for zero, the number up to nine, and 9+ beyond", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(-1)).toBe("");
    expect(badgeText(1)).toBe("1");
    expect(badgeText(9)).toBe("9");
    expect(badgeText(10)).toBe("9+");
  });
});
