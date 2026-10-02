import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import registerHandler from "../auth-register.mts";
import resetPasswordHandler from "../auth-reset-password.mts";
import accountHandler from "../account.mts";
import foundingStatus from "../founding-status.mts";
import { db } from "../../lib/db.ts";
import { canonicalEmail } from "../../lib/accountRules.ts";
import { pgErrorCode } from "../../lib/pgError.ts";
import { hashResetToken } from "../../lib/auth.ts";
import { asUser, createTestUser, jsonBody, rawQuery } from "./fixtures.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

let ipCounter = 0;
function register(email: string, password = "a-good-passphrase", extra: Record<string, unknown> = {}) {
  // a fresh IP per request so the sign-up rate limiter never gets in the way
  ipCounter += 1;
  return registerHandler(
    new Request("https://tasketra.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": `203.0.113.${ipCounter % 250}${Math.floor(ipCounter / 250)}` },
      body: JSON.stringify({ email, password, ...extra }),
    })
  );
}

describe("account rules at sign-up", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    ipCounter = 0;
  });
  afterEach(() => {
    delete process.env.FOUNDING_CAP;
  });

  it("blocks a second account for the same mailbox written differently", async () => {
    expect((await register("karissa@example.com")).status).toBe(201);
    expect((await register("karissa+founding@example.com")).status).toBe(409);
    expect((await register("KARISSA@example.com")).status).toBe(409);
  });

  it("blocks Gmail dot variants and googlemail.com", async () => {
    expect((await register("karissa.keaton@gmail.com")).status).toBe(201);
    expect((await register("karissakeaton@gmail.com")).status).toBe(409);
    expect((await register("k.a.r.i.s.s.a.keaton@googlemail.com")).status).toBe(409);
  });

  it("two sign-ups for the same mailbox at the same instant: one wins, the other gets a clean 409, never a 500", async () => {
    const results = await Promise.all([register("race@example.com"), register("race+x@example.com"), register("race+y@example.com")]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    expect(statuses.filter((s) => s === 409).length).toBe(2);
    const rows = await db().sql`SELECT id FROM users`;
    expect(rows.length).toBe(1);
  });

  it("lets genuinely different addresses through", async () => {
    expect((await register("one@example.com")).status).toBe(201);
    expect((await register("two@example.com")).status).toBe(201);
    expect((await register("one@example.org")).status).toBe(201);
  });

  it("stores the canonical form", async () => {
    await register("Name+tag@Example.com");
    const [row] = await db().sql`SELECT email, email_canonical FROM users`;
    expect(row.email).toBe("name+tag@example.com");
    expect(row.email_canonical).toBe("name@example.com");
  });

  it("the database itself refuses two accounts with the same canonical email", async () => {
    await register("same@example.com");
    await expect(
      db().sql`INSERT INTO users (email, email_canonical, password_hash) VALUES ('other-text@example.com', 'same@example.com', 'x')`
    ).rejects.toSatisfy((e: unknown) => pgErrorCode(e) === "23505");
  });

  it("rejects malformed, oversized and disposable emails", async () => {
    for (const bad of ["", "nope", "a@b", "x@mailinator.com", `${"a".repeat(70)}@example.com`]) {
      const res = await register(bad);
      expect(res.status).toBe(400);
    }
    const rows = await db().sql`SELECT id FROM users`;
    expect(rows.length).toBe(0);
  });

  it("rejects weak passwords with a clear reason", async () => {
    const short = await register("a@example.com", "abc123");
    expect(short.status).toBe(400);
    const common = await register("b@example.com", "password123");
    expect(common.status).toBe(400);
    expect((await jsonBody<{ error: string }>(common)).error).toMatch(/common/);
    const long = await register("c@example.com", "x1".repeat(40));
    expect(long.status).toBe(400);
    const sameAsEmail = await register("dave123@example.com", "dave123");
    expect(sameAsEmail.status).toBe(400);
  });

  it("records when the Terms were accepted, only if the form says so", async () => {
    await register("agreed@example.com", "a-good-passphrase", { acceptedTerms: true });
    await register("silent@example.com");
    const rows = await db().sql`SELECT email, terms_accepted_at FROM users ORDER BY email`;
    expect(rows[0].terms_accepted_at).not.toBeNull();
    expect(rows[1].terms_accepted_at).toBeNull();
  });

  it("awards founding spots by founding count, so removing one reopens it", async () => {
    process.env.FOUNDING_CAP = "2";
    const a = await jsonBody<{ user: { id: string } }>(await register("a@example.com"));
    await register("b@example.com");
    await register("c@example.com");
    let rows = await db().sql`SELECT email, founding_member FROM users ORDER BY email`;
    expect(rows.map((r: any) => r.founding_member)).toEqual([true, true, false]);

    await db().sql`UPDATE users SET founding_member = false WHERE id = ${a.user.id}`;
    await register("d@example.com");
    rows = await db().sql`SELECT email, founding_member FROM users WHERE email = 'd@example.com'`;
    expect(rows[0].founding_member).toBe(true);
  });

  it("FOUNDING_CAP=0 makes every sign-up a normal account", async () => {
    process.env.FOUNDING_CAP = "0";
    await register("first@example.com");
    const [row] = await db().sql`SELECT founding_member FROM users`;
    expect(row.founding_member).toBe(false);
  });

  it("the public founding status uses the same cap", async () => {
    process.env.FOUNDING_CAP = "5";
    await register("one@example.com");
    const res = await foundingStatus(new Request("https://app.tasketra.com/api/founding-status"));
    const body = await jsonBody<{ cap: number; claimed: number; remaining: number }>(res);
    expect(body).toMatchObject({ cap: 5, claimed: 1, remaining: 4 });
  });

  it("applies the same password rules when changing a password", async () => {
    const user = await createTestUser("changer@example.com");
    const weak = await accountHandler(
      asUser(user, { method: "PATCH", url: "https://app.tasketra.com/api/account", body: { action: "change-password", currentPassword: "irrelevant-for-these-tests-123", newPassword: "password123" } })
    );
    expect(weak.status).toBe(400);
    const ok = await accountHandler(
      asUser(user, { method: "PATCH", url: "https://app.tasketra.com/api/account", body: { action: "change-password", currentPassword: "irrelevant-for-these-tests-123", newPassword: "a-brand-new-passphrase" } })
    );
    expect(ok.status).toBe(200);
  });

  it("applies the same password rules when resetting a password", async () => {
    const user = await createTestUser("resetter@example.com");
    await db().sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${hashResetToken("tok")}, now() + interval '1 hour')
    `;
    const reset = (password: string) =>
      resetPasswordHandler(
        new Request("https://app.tasketra.com/api/auth/reset-password", {
          method: "POST",
          headers: { "content-type": "application/json", "x-nf-client-connection-ip": "198.51.100.77" },
          body: JSON.stringify({ token: "tok", password }),
        })
      );
    expect((await reset("12345678")).status).toBe(400);
    expect((await reset("a-brand-new-passphrase")).status).toBe(200);
  });
});

describe("the migration's backfill agrees with canonicalEmail()", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
  });

  it("gives the same answer for a range of addresses", async () => {
    const emails = [
      "plain@example.com", "name+tag@example.com", "a+b+c@example.com", "+tag@example.com",
      "dots.stay@example.com", "d.o.t.s@gmail.com", "d.o.t.t+x@googlemail.com", "...@gmail.com",
      "UPPER.Case+X@Example.COM", "x@sub.domain.example.org",
    ];
    const database = db();
    for (const e of emails) {
      await database.sql`INSERT INTO users (email, password_hash) VALUES (${e.toLowerCase()}, 'x')`;
    }
    const sql = readFileSync(join(__dirname, "../../database/migrations/20261007000000_account_rules/migration.sql"), "utf-8");
    const backfill = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("-- backfill:end"));
    await rawQuery(backfill);
    const rows = await database.sql`SELECT email, email_canonical FROM users`;
    for (const r of rows) {
      expect(r.email_canonical, r.email).toBe(canonicalEmail(r.email));
    }
  });

  it("never fails on existing duplicates: the earliest account keeps the value, later ones are left blank, and the unique index still gets built", async () => {
    const database = db();
    // Put the database back into its "before this migration" shape, with old duplicates in it.
    await rawQuery("DROP INDEX idx_users_email_canonical");
    await rawQuery("UPDATE users SET email_canonical = NULL");
    await database.sql`INSERT INTO users (email, password_hash, created_at) VALUES ('dup@gmail.com', 'x', '2026-01-01')`;
    await database.sql`INSERT INTO users (email, password_hash, created_at) VALUES ('d.up+test@gmail.com', 'x', '2026-02-01')`;
    await database.sql`INSERT INTO users (email, password_hash, created_at) VALUES ('d.u.p@googlemail.com', 'x', '2026-03-01')`;
    await database.sql`INSERT INTO users (email, password_hash, created_at) VALUES ('solo@example.com', 'x', '2026-04-01')`;

    const sql = readFileSync(join(__dirname, "../../database/migrations/20261007000000_account_rules/migration.sql"), "utf-8");
    const rerun = sql.slice(sql.indexOf("-- backfill:start"), sql.indexOf("CREATE TABLE admin_actions"));
    await rawQuery(rerun);

    const rows = await database.sql`SELECT email, email_canonical FROM users ORDER BY created_at`;
    expect(rows.map((r: any) => r.email_canonical)).toEqual(["dup@gmail.com", null, null, "solo@example.com"]);
    const idx = await database.sql`SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_email_canonical'`;
    expect(idx.length).toBe(1);
  });
});
