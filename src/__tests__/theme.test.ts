// @vitest-environment jsdom
//
// Dark mode (v99, quick win #4): the small shared module that reads/writes
// the saved theme choice and applies it as data-theme on <html>. Same
// storage-defensiveness pattern as sidebarState.ts.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readStoredTheme, applyTheme, setTheme } from "../lib/theme";

const KEY = "tasketra.theme";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readStoredTheme()).toBe("system");
  });

  it("reads back a previously stored explicit choice", () => {
    window.localStorage.setItem(KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
    window.localStorage.setItem(KEY, "light");
    expect(readStoredTheme()).toBe("light");
  });

  it("falls back to system for a garbage stored value", () => {
    window.localStorage.setItem(KEY, "solarized");
    expect(readStoredTheme()).toBe("system");
  });

  it("applyTheme sets or clears the data-theme attribute without touching storage", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(KEY)).toBeNull();

    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("setTheme applies the attribute and persists the choice", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(KEY)).toBe("dark");

    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("setTheme(\"system\") clears both the attribute and the stored choice", () => {
    setTheme("dark");
    setTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("doesn't throw when localStorage is unavailable", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(readStoredTheme()).toBe("system");
      expect(() => setTheme("dark")).not.toThrow();
      // The attribute still applies even though persisting failed.
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: original });
    }
  });
});
