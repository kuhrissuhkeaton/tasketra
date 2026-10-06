import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import { markEmailVerified } from "../../lib/emailVerification.ts";
import handler from "../founding-wall.mts";

const URL = "https://app.tasketra.com/api/founding-wall";

describe("founding-wall", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });
  afterEach(() => { delete process.env.FOUNDING_CAP; });

  it("rejects an unauthenticated request", async () => {
    const res = await handler(new Request(URL));
    expect(res.status).toBe(401);
  });

  it("is visible to founding members only", async () => {
    const user = await createTestUser("plain@example.com", { foundingMember: false });
    const res = await handler(asUser(user, { method: "GET", url: URL }));
    expect(res.status).toBe(403);
  });

  it("lists only opted-in founders with a name, by number, and never an email", async () => {
    const a = await createTestUser("a@example.com", { foundingMember: true });
    const b = await createTestUser("b@example.com", { foundingMember: true });
    const hidden = await createTestUser("hidden@example.com", { foundingMember: true });
    const noName = await createTestUser("noname@example.com", { foundingMember: true });
    const gone = await createTestUser("gone@example.com", { foundingMember: false });
    await db().sql`UPDATE users SET founding_number = 2, display_name = 'Bea', founding_wall_opt_in = true WHERE id = ${b.id}`;
    await db().sql`UPDATE users SET founding_number = 1, display_name = 'Ann', founding_wall_opt_in = true WHERE id = ${a.id}`;
    await db().sql`UPDATE users SET founding_number = 3, display_name = 'Hidden', founding_wall_opt_in = false WHERE id = ${hidden.id}`;
    await db().sql`UPDATE users SET founding_number = 4, display_name = NULL, founding_wall_opt_in = true WHERE id = ${noName.id}`;
    await db().sql`UPDATE users SET founding_number = 5, display_name = 'Gone', founding_wall_opt_in = true WHERE id = ${gone.id}`;

    const res = await handler(asUser(a, { method: "GET", url: URL }));
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { members: { number: number; name: string }[] };
    expect(body.members).toEqual([
      { number: 1, name: "Ann" },
      { number: 2, name: "Bea" },
    ]);
    expect(text).not.toContain("@");
  });
});

describe("founding numbers", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); });
  afterEach(() => { delete process.env.FOUNDING_CAP; });

  async function unverified(email: string) {
    const u = await createTestUser(email, { foundingMember: false });
    await db().sql`UPDATE users SET email_verified_at = NULL, founding_member = false, founding_number = NULL, founding_at = NULL WHERE id = ${u.id}`;
    return u;
  }

  it("gives each new founder the next number and a date, and keeps it on repeat", async () => {
    const one = await unverified("n1@example.com");
    const two = await unverified("n2@example.com");
    await markEmailVerified(db(), one.id);
    await markEmailVerified(db(), two.id);
    await markEmailVerified(db(), one.id); // already verified: no change
    const [r1] = await db().sql`SELECT founding_member, founding_number, founding_at FROM users WHERE id = ${one.id}`;
    const [r2] = await db().sql`SELECT founding_member, founding_number, founding_at FROM users WHERE id = ${two.id}`;
    expect(r1.founding_member).toBe(true);
    expect(r1.founding_number).toBe(1);
    expect(r1.founding_at).toBeTruthy();
    expect(r2.founding_number).toBe(2);
  });

  it("gives no number once the cap is reached", async () => {
    process.env.FOUNDING_CAP = "1";
    const one = await unverified("c1@example.com");
    const two = await unverified("c2@example.com");
    await markEmailVerified(db(), one.id);
    await markEmailVerified(db(), two.id);
    const [r2] = await db().sql`SELECT founding_member, founding_number, founding_at FROM users WHERE id = ${two.id}`;
    expect(r2.founding_member).toBe(false);
    expect(r2.founding_number).toBeNull();
    expect(r2.founding_at).toBeNull();
  });

  it("the migration numbers existing founders in signup order", async () => {
    const [{ count }] = await db().sql`SELECT count(*)::int AS count FROM pg_indexes WHERE indexname = 'idx_users_founding_number'`;
    expect(count).toBe(1);
  });
});
