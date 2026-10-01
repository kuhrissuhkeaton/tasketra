import { describe, it, expect } from "vitest";
import { mailtoHref, telHref } from "../contactLinks";

describe("mailtoHref", () => {
  it("builds a mailto link for a normal address", () => {
    expect(mailtoHref("travis@example.com")).toBe("mailto:travis@example.com");
    expect(mailtoHref("  jo.smith+pm@sub.example.co.uk ")).toBe("mailto:jo.smith+pm@sub.example.co.uk");
  });

  it("returns null for empty or missing values", () => {
    expect(mailtoHref("")).toBeNull();
    expect(mailtoHref(null)).toBeNull();
    expect(mailtoHref(undefined)).toBeNull();
  });

  it("returns null for anything that is not a single clean address", () => {
    expect(mailtoHref("not an email")).toBeNull();
    expect(mailtoHref("a@b")).toBeNull();
    expect(mailtoHref("a@b.com, c@d.com")).toBeNull();
    expect(mailtoHref("a@b.com?subject=hi")).toBeNull();
    expect(mailtoHref("a@b.com?bcc=x@y.com")).toBeNull();
    expect(mailtoHref("a@b.com#frag")).toBeNull();
  });

  it("never lets a stray header or line break through", () => {
    expect(mailtoHref("a@b.com\nbcc:evil@x.com")).toBeNull();
    expect(mailtoHref("<a@b.com>")).toBeNull();
  });
});

describe("telHref", () => {
  it("strips punctuation to digits", () => {
    expect(telHref("(803) 555-0142")).toBe("tel:8035550142");
    expect(telHref("803.555.0142")).toBe("tel:8035550142");
  });

  it("keeps a leading plus for international numbers", () => {
    expect(telHref("+32 9 555 01 42")).toBe("tel:+3295550142");
  });

  it("ignores an extension", () => {
    expect(telHref("803-555-0142 x204")).toBe("tel:8035550142");
    expect(telHref("803-555-0142 ext. 9")).toBe("tel:8035550142");
  });

  it("returns null when it does not look like a phone number", () => {
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
    expect(telHref("call me")).toBeNull();
    expect(telHref("12345")).toBeNull();
    expect(telHref("1".repeat(20))).toBeNull();
  });
});
