import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { asUser, createTestUser, jsonBody } from "./fixtures.ts";
import handler from "../admin-broadcast.mts";
import { db } from "../../lib/db.ts";
import { renderBody, firstNameOf, sendNextBatch, createBroadcast } from "../../lib/broadcast.ts";

const URL = "https://app.tasketra.com/api/admin-broadcast";
const post = (u: { cookie: string }, body: unknown) => handler(asUser(u, { method: "POST", url: URL, body }));
const get = (u: { cookie: string }, q = "") => handler(asUser(u, { method: "GET", url: URL + q }));

describe("admin-broadcast", () => {
  let sent: { to: string; subject: string; text: string; reply_to?: string }[] = [];
  let failFor = new Set<string>();
  const realFetch = globalThis.fetch;

  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => {
    await resetTestDb();
    sent = []; failFor = new Set();
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.RESEND_API_KEY = "k";
    globalThis.fetch = vi.fn(async (_u: any, init: any) => {
      const b = JSON.parse(init.body);
      if (failFor.has(b.to)) return new Response("{}", { status: 500 });
      sent.push({ to: b.to, subject: b.subject, text: b.text, reply_to: b.reply_to });
      return new Response("{}", { status: 200 });
    }) as any;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.ADMIN_EMAIL; delete process.env.RESEND_API_KEY;
  });

  async function setup(n = 3) {
    const admin = await createTestUser("admin@example.com", { foundingMember: true });
    await db().sql`UPDATE users SET display_name = 'Karissa Keaton' WHERE id = ${admin.id}`;
    for (let i = 0; i < n; i++) {
      const u = await createTestUser(`member${i}@example.com`, { foundingMember: true });
      if (i === 0) await db().sql`UPDATE users SET display_name = 'Pat Smith' WHERE id = ${u.id}`;
    }
    // not eligible: not founding, unconfirmed founding
    await createTestUser("regular@example.com");
    await createTestUser("unconfirmed@example.com", { foundingMember: true, verified: false });
    return { admin };
  }

  it("is admin-only", async () => {
    const { admin } = await setup();
    const other = await createTestUser("other@example.com");
    expect((await handler(new Request(URL))).status).toBe(401);
    expect((await get(other)).status).toBe(403);
    delete process.env.ADMIN_EMAIL;
    expect((await get(admin)).status).toBe(403);
  });

  it("counts only founding members with a confirmed email", async () => {
    const { admin } = await setup(3);
    const body = await jsonBody<{ audience: number }>(await get(admin));
    expect(body.audience).toBe(4); // admin + 3 members
  });

  it("sends a test only to the admin, marked as a test", async () => {
    const { admin } = await setup();
    const res = await post(admin, { action: "test", subject: "Hello", body: "Hi {first_name},\nThanks." });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("admin@example.com");
    expect(sent[0].subject).toBe("[Test] Hello");
    expect(sent[0].text).toContain("Hi Karissa,");
  });

  it("sends to every eligible founding member once, personalised, with reply-to and a footer", async () => {
    const { admin } = await setup(3);
    let res = await post(admin, { action: "send", subject: "Thanks", body: "Hi {first_name},\nThank you.", holdCheckin: false });
    expect(res.status).toBe(200);
    let { progress } = await jsonBody<{ progress: { id: string; pending: number } }>(res);
    while (progress.pending > 0) {
      ({ progress } = await jsonBody(await post(admin, { action: "continue", broadcastId: progress.id })));
    }
    expect(sent.map((s) => s.to).sort()).toEqual(["admin@example.com", "member0@example.com", "member1@example.com", "member2@example.com"]);
    const pat = sent.find((s) => s.to === "member0@example.com")!;
    expect(pat.text).toContain("Hi Pat,");
    expect(sent.find((s) => s.to === "member1@example.com")!.text).toContain("Hi there,");
    expect(pat.text).toContain("just reply and tell me");
    expect(pat.reply_to).toBe("admin@example.com");

    // asking for more batches afterwards sends nothing new
    const before = sent.length;
    await post(admin, { action: "continue", broadcastId: progress.id });
    expect(sent.length).toBe(before);
  });

  it("never double-sends when batches overlap", async () => {
    const { admin } = await setup(5);
    const { id } = await createBroadcast(db(), admin.id, { subject: "S", body: "B", holdCheckin: false });
    const noGap = { gapMs: 0, limit: 3 };
    await Promise.all([sendNextBatch(db(), id, noGap), sendNextBatch(db(), id, noGap), sendNextBatch(db(), id, noGap)]);
    await sendNextBatch(db(), id, { gapMs: 0, limit: 10 });
    const counts: Record<string, number> = {};
    for (const s of sent) counts[s.to] = (counts[s.to] ?? 0) + 1;
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);
    expect(Object.keys(counts)).toHaveLength(6);
  });

  it("records failures, keeps going, and can retry just those", async () => {
    const { admin } = await setup(3);
    failFor.add("member1@example.com");
    let res = await post(admin, { action: "send", subject: "S", body: "B", holdCheckin: false });
    let { progress } = await jsonBody<{ progress: { id: string; pending: number; failed: number; sent: number } }>(res);
    while (progress.pending > 0) ({ progress } = await jsonBody(await post(admin, { action: "continue", broadcastId: progress.id })));
    expect(progress.failed).toBe(1);
    expect(progress.sent).toBe(3);

    failFor.clear();
    const before = sent.length;
    const retry = await jsonBody<{ progress: { failed: number; sent: number } }>(await post(admin, { action: "retry", broadcastId: progress.id }));
    expect(retry.progress.failed).toBe(0);
    expect(retry.progress.sent).toBe(4);
    expect(sent.length).toBe(before + 1);
  });

  it("stops and leaves the rest pending when Resend rate-limits", async () => {
    const { admin } = await setup(3);
    const { id } = await createBroadcast(db(), admin.id, { subject: "S", body: "B", holdCheckin: false });
    const limited = vi.fn()
      .mockResolvedValueOnce({ sent: true })
      .mockResolvedValue({ sent: false, reason: "resend_error_429" });
    const r = await sendNextBatch(db(), id, { send: limited, gapMs: 0 });
    expect(r.rateLimited).toBe(true);
    expect(r.progress.sent).toBe(1);
    expect(r.progress.pending).toBe(3);
    expect(r.progress.failed).toBe(0);
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it("warns before sending the exact same message twice within a day", async () => {
    const { admin } = await setup(1);
    expect((await post(admin, { action: "send", subject: "S", body: "B", holdCheckin: false })).status).toBe(200);
    const again = await post(admin, { action: "send", subject: "S", body: "B", holdCheckin: false });
    expect(again.status).toBe(409);
    expect((await post(admin, { action: "send", subject: "S", body: "B", holdCheckin: false, force: true })).status).toBe(200);
  });

  it("can hold the automatic check-in about a week for people who get the email", async () => {
    const { admin } = await setup(1);
    await post(admin, { action: "send", subject: "S", body: "B", holdCheckin: true });
    const [row] = await db().sql`
      SELECT (last_pulse_sent_at < now() - interval '13 days') AS due_now,
             (last_pulse_sent_at < now() - interval '5 days' AND last_pulse_sent_at > now() - interval '7 days') AS about_a_week
      FROM users WHERE email = 'member0@example.com'
    `;
    expect(row.due_now).toBe(false);
    expect(row.about_a_week).toBe(true);
    // someone who was not emailed is untouched
    const [other] = await db().sql`SELECT last_pulse_sent_at FROM users WHERE email = 'regular@example.com'`;
    expect(other.last_pulse_sent_at).toBeNull();
  });

  it("rejects an empty or multi-line subject and an empty message", async () => {
    const { admin } = await setup(1);
    for (const body of [{ subject: "", body: "x" }, { subject: "x", body: "  " }, { subject: "a\nb", body: "x" }]) {
      expect((await post(admin, { action: "send", holdCheckin: false, ...body })).status).toBe(400);
    }
  });

  it("renders names", () => {
    expect(firstNameOf("  Pat  Smith ")).toBe("Pat");
    expect(firstNameOf(null)).toBe("");
    expect(renderBody("Hi {{first_name}} and {first_name}", "Pat")).toContain("Hi Pat and Pat");
    expect(renderBody("Hi {first_name}", "")).toContain("Hi there");
  });
});
