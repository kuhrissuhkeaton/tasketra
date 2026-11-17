// @vitest-environment jsdom
//
// v163 (Phase 6, Delight pack): the shared Delight setting and the pure
// egg helpers. The setting is per-user browser storage (the firstRun.ts
// pattern, no migration): unset means ON, and only "off" is ever
// written, so a user who never touches the switch has nothing stored.
import { describe, it, expect, beforeEach } from "vitest";
import { readDelight, writeDelight, fastAnswerMinutes, isEggFeedItem } from "../lib/delight";
import { buildRecap } from "../lib/syncRecap";
import type { WeeklySyncProject } from "../lib/api";

beforeEach(() => {
  window.localStorage.clear();
});

describe("Delight setting", () => {
  it("defaults to on when nothing is stored", () => {
    expect(readDelight("u1")).toBe(true);
  });

  it("round-trips off and back on, storing only the off state", () => {
    writeDelight("u1", false);
    expect(readDelight("u1")).toBe(false);
    expect(window.localStorage.getItem("tasketra:delight:u1")).toBe("off");
    writeDelight("u1", true);
    expect(readDelight("u1")).toBe(true);
    expect(window.localStorage.getItem("tasketra:delight:u1")).toBeNull();
  });

  it("is per-user: one user's off leaves another's default on", () => {
    writeDelight("u1", false);
    expect(readDelight("u1")).toBe(false);
    expect(readDelight("u2")).toBe(true);
  });
});

describe("fastAnswerMinutes (Egg 7)", () => {
  const sent = "2026-11-10T10:00:00Z";
  it("returns whole minutes for an answer inside the hour", () => {
    expect(fastAnswerMinutes(sent, "2026-11-10T10:43:30Z")).toBe(43);
    expect(fastAnswerMinutes(sent, "2026-11-10T11:00:00Z")).toBe(60);
  });

  it("floors a sub-minute answer to 1 minute, never 0", () => {
    expect(fastAnswerMinutes(sent, "2026-11-10T10:00:20Z")).toBe(1);
  });

  it("returns null past the hour, with no answer, or on a skewed clock", () => {
    expect(fastAnswerMinutes(sent, "2026-11-10T11:00:01Z")).toBeNull();
    expect(fastAnswerMinutes(sent, null)).toBeNull();
    expect(fastAnswerMinutes(sent, undefined)).toBeNull();
    expect(fastAnswerMinutes(sent, "2026-11-10T09:59:00Z")).toBeNull();
    expect(fastAnswerMinutes(sent, sent)).toBeNull();
  });
});

describe("isEggFeedItem (Eggs 6 and 10 hide with the toggle)", () => {
  it("matches exactly the two egg activity bodies", () => {
    expect(isEggFeedItem({ type: "activity", body: "On the nose." })).toBe(true);
    expect(isEggFeedItem({ type: "activity", body: "Century: 100 tasks done on this project." })).toBe(true);
  });

  it("leaves every other feed row alone", () => {
    expect(isEggFeedItem({ type: "activity", body: "Maya marked \"Kickoff\" done." })).toBe(false);
    expect(isEggFeedItem({ type: "status_update", body: "On the nose." })).toBe(false);
    expect(isEggFeedItem({ type: "activity", body: null })).toBe(false);
  });
});

describe("Egg 2 (Clean sweep) rides the toggle in the recap", () => {
  const project = (over: Partial<WeeklySyncProject> = {}): WeeklySyncProject => ({
    id: "p1", name: "Alpha", health: "on_track", statedHealth: null, statedAt: null,
    lastActivityAt: null, overdueTasks: 0, openDecisions: 0, ...over,
  });

  it("keeps the line by default and with delight on", () => {
    expect(buildRecap({ projects: [project({})], asks: [] }, "2026-11-04")).toContain("Clean sweep: nobody is waiting on anybody.");
    expect(buildRecap({ projects: [project({})], asks: [] }, "2026-11-04", undefined, { delight: true })).toContain("Clean sweep");
  });

  it("drops the line when delight is off, and nothing else changes", () => {
    const on = buildRecap({ projects: [project({})], asks: [] }, "2026-11-04");
    const off = buildRecap({ projects: [project({})], asks: [] }, "2026-11-04", undefined, { delight: false });
    expect(off).not.toContain("Clean sweep");
    expect(off.length).toBeLessThan(on.length);
    expect(off).toContain("Alpha");
  });
});
