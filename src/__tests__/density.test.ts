// @vitest-environment jsdom
//
// v172 density preference: stored per device, applied as a
// data-density attribute on <html>, comfortable by default.
import { describe, it, expect, beforeEach } from "vitest";
import { readDensity, writeDensity, initDensity } from "../lib/density";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.density;
});

describe("density preference (v172)", () => {
  it("defaults to comfortable and applies on init", () => {
    expect(readDensity()).toBe("comfortable");
    expect(initDensity()).toBe("comfortable");
    expect(document.documentElement.dataset.density).toBe("comfortable");
  });

  it("write persists and applies compact", () => {
    writeDensity("compact");
    expect(window.localStorage.getItem("tasketra:density")).toBe("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(readDensity()).toBe("compact");
  });

  it("a stored compact survives init; junk values fall back", () => {
    window.localStorage.setItem("tasketra:density", "compact");
    expect(initDensity()).toBe("compact");
    window.localStorage.setItem("tasketra:density", "banana");
    expect(readDensity()).toBe("comfortable");
  });
});
