import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Step 1 Foundation Plan §5.4, release R2: session revocation only works
// if EVERY handler goes through the async, database-checked
// getUserIdFromRequest. The pre-R2 synchronous parser (signature and
// expiry only, no revocation check) is deleted in the same release, and
// this static test is the fence that keeps it deleted: it fails if the
// session check in auth.ts stops being async, if its private parse helper
// becomes an exported signature-only path, or if any production call site
// uses the check without awaiting it.
const here = dirname(fileURLToPath(import.meta.url));
const libDir = join(here, "..");
const functionsDir = join(here, "..", "..", "functions");

function productionSources(): { name: string; source: string }[] {
  const files: { name: string; source: string }[] = [];
  for (const name of readdirSync(functionsDir)) {
    if (name.endsWith(".mts")) {
      files.push({ name: `functions/${name}`, source: readFileSync(join(functionsDir, name), "utf8") });
    }
  }
  for (const name of readdirSync(libDir)) {
    if (name.endsWith(".ts") && name !== "auth.ts") {
      files.push({ name: `lib/${name}`, source: readFileSync(join(libDir, name), "utf8") });
    }
  }
  return files;
}

describe("session revocation fence (plan §5.4)", () => {
  it("the session check is async and its parse helper stays private", () => {
    const auth = readFileSync(join(libDir, "auth.ts"), "utf8");
    expect(auth).toContain("export async function getUserIdFromRequest");
    expect(auth).not.toMatch(/export function getUserIdFromRequest/);
    expect(auth).not.toMatch(/export (function|const) parseSessionCookie/);
    // The check must actually consult the stored version -- a future edit
    // that quietly dropped the database read would reopen F36 while every
    // other assertion here still passed.
    expect(auth).toContain("SELECT session_version FROM users");
  });

  it("every production call site awaits the session check", () => {
    const offenders: string[] = [];
    for (const { name, source } of productionSources()) {
      for (const match of source.matchAll(/getUserIdFromRequest\(/g)) {
        const before = source.slice(Math.max(0, match.index - 6), match.index);
        if (before !== "await ") offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the cookie carries the session version as its third segment", () => {
    const auth = readFileSync(join(libDir, "auth.ts"), "utf8");
    expect(auth).toContain("`${userId}.${expires}.${sessionVersion}`");
    expect(auth).toContain("parts.length !== 4");
  });
});
