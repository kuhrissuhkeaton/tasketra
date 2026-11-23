// @vitest-environment jsdom
//
// v173.2: trial intent is remembered at a plan=pro registration and consumed
// exactly once, the first time a verified user is seen, so the
// email-confirmation round trip can carry the person on to Billing.
import { describe, it, expect, beforeEach } from "vitest";
import { rememberTrialIntent, takeTrialIntent } from "../trialIntent";
import type { User } from "../api";

const KEY = "tasketra.trialIntent";

function user(overrides: Partial<User> = {}): User {
  return { id: "u1", email: "me@gmail.com", emailVerified: true, plan: "free", ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("takeTrialIntent", () => {
  it("routes a verified free account whose email matches the stored intent", () => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user())).toBe(true);
  });

  it("matches the stored email case-insensitively", () => {
    rememberTrialIntent("Me@Gmail.com");
    expect(takeTrialIntent(user({ email: "me@gmail.COM" }))).toBe(true);
  });

  it("treats a missing plan as free, like Billing does", () => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user({ plan: undefined }))).toBe(true);
  });

  it("consumes the intent: a second sighting does not route again", () => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user())).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(takeTrialIntent(user())).toBe(false);
  });

  it("does not route when no intent was stored", () => {
    expect(takeTrialIntent(user())).toBe(false);
  });

  it("never routes a founding account, and clears its stray intent", () => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user({ plan: "founding" }))).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(takeTrialIntent(user({ plan: "founding" }))).toBe(false);
  });

  it.each(["trialing", "active", "past_due"] as const)("never routes an account already on a plan (%s), and clears the intent", (plan) => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user({ plan }))).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("does not route a different account, and clears the stale intent", () => {
    rememberTrialIntent("someone-else@gmail.com");
    expect(takeTrialIntent(user())).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("neither routes nor consumes while the user is still unverified", () => {
    rememberTrialIntent("me@gmail.com");
    expect(takeTrialIntent(user({ emailVerified: false }))).toBe(false);
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    // Once verified, the same intent is still there to consume.
    expect(takeTrialIntent(user())).toBe(true);
  });

  it("ignores a malformed stored value", () => {
    window.localStorage.setItem(KEY, "not json");
    expect(takeTrialIntent(user())).toBe(false);
    window.localStorage.setItem(KEY, JSON.stringify({ email: 42 }));
    expect(takeTrialIntent(user())).toBe(false);
  });
});
