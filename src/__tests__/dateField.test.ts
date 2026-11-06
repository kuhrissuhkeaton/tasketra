import { describe, expect, it } from "vitest";
import { parseDateInput, formatDateForDisplay } from "../components/DateField";

describe("parseDateInput", () => {
  it("accepts M/D/YYYY as people type it", () => {
    expect(parseDateInput("11/20/2026")).toBe("2026-11-20");
    expect(parseDateInput("1/5/2027")).toBe("2027-01-05");
    expect(parseDateInput(" 11/20/2026 ")).toBe("2026-11-20");
  });

  it("accepts ISO dates unchanged", () => {
    expect(parseDateInput("2026-11-20")).toBe("2026-11-20");
  });

  it("rejects impossible and malformed dates", () => {
    expect(parseDateInput("13/01/2026")).toBeNull();
    expect(parseDateInput("2/30/2026")).toBeNull();
    expect(parseDateInput("2026-02-30")).toBeNull();
    expect(parseDateInput("202026")).toBeNull();
    expect(parseDateInput("next Friday")).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("11/20/26")).toBeNull();
  });
});

describe("formatDateForDisplay", () => {
  it("renders ISO as M/D/YYYY", () => {
    expect(formatDateForDisplay("2026-11-20")).toBe("11/20/2026");
    expect(formatDateForDisplay("2027-01-05")).toBe("1/5/2027");
  });

  it("passes through anything unrecognized", () => {
    expect(formatDateForDisplay("")).toBe("");
    expect(formatDateForDisplay("junk")).toBe("junk");
  });
});
