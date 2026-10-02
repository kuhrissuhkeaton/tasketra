import { describe, it, expect, afterEach } from "vitest";
import {
  canonicalEmail,
  foundingCap,
  isDisposableDomain,
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "../accountRules.ts";

describe("canonicalEmail", () => {
  it("lowercases and trims", () => {
    expect(canonicalEmail("  Karissa@Example.COM ")).toBe("karissa@example.com");
  });
  it("ignores everything after a plus sign", () => {
    expect(canonicalEmail("karissa+founding@example.com")).toBe("karissa@example.com");
    expect(canonicalEmail("karissa+a+b@example.com")).toBe("karissa@example.com");
  });
  it("ignores dots for gmail and googlemail, and nowhere else", () => {
    expect(canonicalEmail("k.a.r.i.s.s.a@gmail.com")).toBe("karissa@gmail.com");
    expect(canonicalEmail("karissa@googlemail.com")).toBe("karissa@gmail.com");
    expect(canonicalEmail("k.a.r@example.com")).toBe("k.a.r@example.com");
  });
  it("keeps an address whose name part would otherwise vanish", () => {
    expect(canonicalEmail("+tag@example.com")).toBe("+tag@example.com");
    expect(canonicalEmail("...@gmail.com")).toBe("...@gmail.com");
  });
  it("treats different people as different", () => {
    expect(canonicalEmail("karissa@example.com")).not.toBe(canonicalEmail("karissa2@example.com"));
    expect(canonicalEmail("a@example.com")).not.toBe(canonicalEmail("a@example.org"));
  });
});

describe("validateEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(validateEmail("person@example.com")).toBeNull();
    expect(validateEmail("first.last+tag@sub.example.co.uk")).toBeNull();
  });
  it("rejects missing, malformed and oversized addresses", () => {
    expect(validateEmail("")).not.toBeNull();
    expect(validateEmail("no-at-sign")).not.toBeNull();
    expect(validateEmail("two@@example.com")).not.toBeNull();
    expect(validateEmail("space in@example.com")).not.toBeNull();
    expect(validateEmail("a@b")).not.toBeNull();
    expect(validateEmail("a@example..com")).not.toBeNull();
    expect(validateEmail(`${"a".repeat(65)}@example.com`)).not.toBeNull();
    expect(validateEmail(`a@${"b".repeat(250)}.com`)).not.toBeNull();
  });
  it("rejects disposable mailbox domains", () => {
    expect(validateEmail("x@mailinator.com")).toMatch(/permanent/i);
    expect(isDisposableDomain("YOPMAIL.com")).toBe(true);
    expect(isDisposableDomain("gmail.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("handles non-strings", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(42)).toBe("42");
  });
});

describe("validatePassword", () => {
  it("accepts a normal password", () => {
    expect(validatePassword("correct horse battery", "a@example.com")).toBeNull();
  });
  it("requires 8 characters", () => {
    expect(validatePassword("short1")).toMatch(/at least 8/);
  });
  it("refuses more than 72 bytes (bcrypt would silently cut it off)", () => {
    expect(validatePassword("a1".repeat(36))).toBeNull();
    expect(validatePassword("a1".repeat(37))).toMatch(/72/);
    expect(validatePassword("é".repeat(37))).toMatch(/72/); // 74 bytes, 37 characters
  });
  it("refuses very common and all-one-character passwords", () => {
    expect(validatePassword("password123")).toMatch(/common/);
    expect(validatePassword("PASSWORD")).toMatch(/common/);
    expect(validatePassword("aaaaaaaaaa")).toMatch(/easy to guess/);
  });
  it("refuses a password that is the email or its name part", () => {
    expect(validatePassword("karissa@example.com", "karissa@example.com")).toMatch(/email/);
    expect(validatePassword("karissa99", "karissa99@example.com")).toMatch(/email/);
    expect(validatePassword("karissa99", "someone@example.com")).toBeNull();
  });
});

describe("foundingCap", () => {
  afterEach(() => {
    delete process.env.FOUNDING_CAP;
  });
  it("defaults to 100", () => {
    delete process.env.FOUNDING_CAP;
    expect(foundingCap()).toBe(100);
  });
  it("can be set, including to 0", () => {
    process.env.FOUNDING_CAP = "25";
    expect(foundingCap()).toBe(25);
    process.env.FOUNDING_CAP = "0";
    expect(foundingCap()).toBe(0);
  });
  it("falls back to 100 for nonsense", () => {
    for (const bad of ["abc", "-5", "1.5", ""]) {
      process.env.FOUNDING_CAP = bad;
      expect(foundingCap()).toBe(100);
    }
  });
});

import { pgErrorCode, pgErrorConstraint } from "../pgError.ts";

describe("pgErrorCode", () => {
  it("reads the code from the error or from its cause", () => {
    expect(pgErrorCode({ code: "23505" })).toBe("23505");
    expect(pgErrorCode({ cause: { code: "23503", constraint: "fk_x" } })).toBe("23503");
    expect(pgErrorConstraint({ cause: { constraint: "fk_x" } })).toBe("fk_x");
    expect(pgErrorCode(new Error("plain"))).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
  });
});
