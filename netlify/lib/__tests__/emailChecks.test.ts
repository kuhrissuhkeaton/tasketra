import { describe, it, expect } from "vitest";
import { suggestEmailFix, checkMailDomain, type MailResolver } from "../emailChecks.ts";

const err = (code: string) => Object.assign(new Error(code), { code });
function resolver(p: Partial<MailResolver>): MailResolver {
  return {
    resolveMx: async () => { throw err("ENODATA"); },
    resolve4: async () => { throw err("ENODATA"); },
    resolve6: async () => { throw err("ENODATA"); },
    ...p,
  };
}

describe("suggestEmailFix", () => {
  it("fixes common provider typos", () => {
    expect(suggestEmailFix("a@gmail.co")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@gmial.com")).toBe("a@gmail.com");
    expect(suggestEmailFix("a@yahoo.con")).toBe("a@yahoo.com");
    expect(suggestEmailFix("a@acme.con")).toBe("a@acme.com");
    expect(suggestEmailFix("a@acme.ocm")).toBe("a@acme.com");
  });
  it("leaves real addresses alone, including other .co domains", () => {
    expect(suggestEmailFix("a@gmail.com")).toBeNull();
    expect(suggestEmailFix("a@startup.co")).toBeNull();
    expect(suggestEmailFix("a@example.org")).toBeNull();
    expect(suggestEmailFix("nonsense")).toBeNull();
  });
});

describe("checkMailDomain", () => {
  it("ok when there is a mail server", async () => {
    expect(await checkMailDomain("x.com", resolver({ resolveMx: async () => [{ exchange: "mx.x.com" }] }))).toBe("ok");
  });
  it("no_mail for a null MX", async () => {
    expect(await checkMailDomain("x.com", resolver({ resolveMx: async () => [{ exchange: "" }] }))).toBe("no_mail");
  });
  it("falls back to an address record", async () => {
    expect(await checkMailDomain("x.com", resolver({ resolve4: async () => ["1.2.3.4"] }))).toBe("ok");
  });
  it("no_mail when the domain doesn't exist", async () => {
    expect(await checkMailDomain("nope.invalid", resolver({ resolveMx: async () => { throw err("ENOTFOUND"); }, resolve4: async () => { throw err("ENOTFOUND"); }, resolve6: async () => { throw err("ENOTFOUND"); } }))).toBe("no_mail");
  });
  it("fails open on DNS errors and timeouts", async () => {
    expect(await checkMailDomain("x.com", resolver({ resolveMx: async () => { throw err("ESERVFAIL"); } }))).toBe("unknown");
    expect(await checkMailDomain("x.com", resolver({ resolveMx: () => new Promise(() => {}) }), 20)).toBe("unknown");
  });
});
