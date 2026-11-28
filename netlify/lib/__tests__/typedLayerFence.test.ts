import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Step 1 Foundation Plan §5.5: the typed data layer is fenced to the
// permission / money / privacy files. Their database handles are
// DatabaseConnection and their queries carry the row types from
// netlify/lib/rows.ts. This static test is the fence: it fails if an
// untyped `database: any` handle reappears in a fenced file, or if the
// typing is removed wholesale. (ownership.ts takes no database parameter
// -- it calls db() internally -- so for that file the fence asserts the
// row generics on its queries directly.)
const FENCED = ["ownership.ts", "adminGate.ts", "apiTokens.ts", "billing.ts"];
const WITH_HANDLE = ["adminGate.ts", "apiTokens.ts", "billing.ts"];

function source(name: string): string {
  return readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
}

describe("typed data layer fence (plan §5.5)", () => {
  it("no fenced file has an untyped database handle", () => {
    for (const name of FENCED) {
      expect(source(name), name).not.toMatch(/database\s*:\s*any\b/);
    }
  });

  it("the handle-taking fenced files take DatabaseConnection", () => {
    for (const name of WITH_HANDLE) {
      expect(source(name), name).toContain("database: DatabaseConnection");
    }
  });

  it("ownership.ts types its queries with row generics", () => {
    const generics = source("ownership.ts").match(/database\.sql</g) ?? [];
    expect(generics.length).toBe(2);
    expect(source("ownership.ts")).toContain("database.sql<ExistenceRow>");
  });

  it("rows.ts holds the sensitive tables' row types", () => {
    const rows = source("rows.ts");
    for (const typeName of [
      "UserIdentityRow",
      "UserFoundingMemberRow",
      "ExistenceRow",
      "ProjectCountRow",
      "SubscriptionStatusRow",
      "StorageTotalRow",
      "DecisionRequestRow",
      "ApiTokenRow",
      "ApiTokenAuthRow",
    ]) {
      expect(rows, typeName).toContain(`export type ${typeName}`);
    }
  });
});
