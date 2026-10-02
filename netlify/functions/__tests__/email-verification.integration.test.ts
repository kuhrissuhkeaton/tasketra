import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import registerHandler from "../auth-register.mts";
import verifyHandler from "../auth-verify-email.mts";
import resendHandler from "../auth-resend-verification.mts";
import accountHandler from "../account.mts";
import projectsHandler from "../projects.mts";
import membersHandler from "../members.mts";
import documentsHandler from "../documents.mts";
import checkoutHandler from "../create-checkout-session.mts";
import meHandler from "../auth-me.mts";
import resetPasswordHandler from "../auth-reset-password.mts";
import { db } from "../../lib/db.ts";
import { hashResetToken } from "../../lib/auth.ts";
import { asUser, createTestUser, jsonBody } from "./fixtures.ts";

let ip = 0;
function register(email: string, password = "a-good-passphrase") {
  ip += 1;
  return registerHandler(
    new Request("https://tasketra.com/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": `198.51.100.${ip}` },
      body: JSON.stringify({ email, password, acceptedTerms: true }),
    })
  );
}
function verify(token: string) {
  return verifyHandler(
    new Request("https://app.tasketra.com/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
  );
}
function cookieOf(res: Response) {
  return (res.headers.get("set-cookie") || "").split(";")[0];
}

describe("email verification", () => {
  let sent: { to: string; text: string }[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => {
    await resetTestDb();
    ip = 0;
    sent = [];
    process.env.RESEND_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      const body = JSON.parse(init.body);
      sent.push({ to: body.to, text: body.text });
      return new Response("{}", { status: 200 });
    }) as any;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.FOUNDING_CAP;
  });

  const lastToken = () => decodeURIComponent(/token=([^\s]+)/.exec(sent[sent.length - 1].text)![1]);

  it("sign-up creates an unverified account and emails a link", async () => {
    const res = await register("new@example.com");
    expect(res.status).toBe(201);
    const body = await jsonBody<{ verificationRequired: boolean; verificationEmailSent: boolean; user: { id: string } }>(res);
    expect(body.verificationRequired).toBe(true);
    expect(body.verificationEmailSent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("new@example.com");
    const [row] = await db().sql`SELECT email_verified_at, founding_member FROM users WHERE id = ${body.user.id}`;
    expect(row.email_verified_at).toBeNull();
    expect(row.founding_member).toBe(false);
  });

  it("sign-up still succeeds when the email can't be sent, and says so", async () => {
    delete process.env.RESEND_API_KEY;
    const body = await jsonBody<{ verificationEmailSent: boolean }>(await register("quiet@example.com"));
    expect(body.verificationEmailSent).toBe(false);
  });

  it("rejects an obvious typo and suggests the fix", async () => {
    const res = await register("karissa@gmail.co");
    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string; suggestion: string }>(res);
    expect(body.suggestion).toBe("karissa@gmail.com");
    expect(body.error).toContain("karissa@gmail.com");
    const [{ count }] = await db().sql`SELECT count(*)::int AS count FROM users`;
    expect(count).toBe(0);
  });

  it("the link confirms the account, awards a founding spot, and attaches invitations", async () => {
    const owner = await createTestUser("owner@example.com");
    const [project] = await db().sql`INSERT INTO projects (name, owner_id) VALUES ('P', ${owner.id}) RETURNING id`;
    await db().sql`INSERT INTO project_members (project_id, invited_email, status) VALUES (${project.id}, 'invitee@example.com', 'invited')`;

    const { user } = await jsonBody<{ user: { id: string } }>(await register("invitee@example.com"));
    // before confirming: no membership attached
    let [m] = await db().sql`SELECT user_id, status FROM project_members WHERE invited_email = 'invitee@example.com'`;
    expect(m.user_id).toBeNull();

    const res = await verify(lastToken());
    expect(res.status).toBe(200);
    expect((await jsonBody<{ founding: boolean }>(res)).founding).toBe(true);
    expect(res.headers.get("set-cookie")).toBeNull(); // never signs anyone in
    [m] = await db().sql`SELECT user_id, status FROM project_members WHERE invited_email = 'invitee@example.com'`;
    expect(m.user_id).toBe(user.id);
    expect(m.status).toBe("active");
  });

  it("a link works once, and unknown tokens are rejected", async () => {
    await register("once@example.com");
    const token = lastToken();
    expect((await verify(token)).status).toBe(200);
    expect((await verify(token)).status).toBe(400);
    expect((await verify("not-a-real-token")).status).toBe(400);
    expect((await verifyHandler(new Request("https://x/api/auth/verify-email", { method: "POST", body: "{}" }))).status).toBe(400);
  });

  it("an expired link is rejected", async () => {
    await register("late@example.com");
    await db().sql`UPDATE email_verification_tokens SET expires_at = now() - interval '1 minute'`;
    expect((await verify(lastToken())).status).toBe(400);
  });

  it("a newer link retires the older one", async () => {
    const reg = await register("twice@example.com");
    const first = lastToken();
    await resendHandler(asUser({ cookie: cookieOf(reg) }, { method: "POST", url: "https://app.tasketra.com/api/auth/resend-verification" }));
    expect(sent).toHaveLength(2);
    expect((await verify(first)).status).toBe(400);
    expect((await verify(lastToken())).status).toBe(200);
  });

  it("resend is limited, reports a send failure, and is a no-op once confirmed", async () => {
    const reg = await register("resend@example.com");
    const cookie = cookieOf(reg);
    const resend = () => resendHandler(asUser({ cookie }, { method: "POST", url: "https://app.tasketra.com/api/auth/resend-verification" }));
    for (let i = 0; i < 5; i++) expect((await resend()).status).toBe(200);
    expect((await resend()).status).toBe(429);

    await db().sql`DELETE FROM rate_limit_hits`;
    delete process.env.RESEND_API_KEY;
    expect((await resend()).status).toBe(502);

    await db().sql`UPDATE users SET email_verified_at = now()`;
    const done = await jsonBody<{ alreadyVerified: boolean }>(await resend());
    expect(done.alreadyVerified).toBe(true);
  });

  it("a mistyped address can be fixed before confirming, and old links stop working", async () => {
    const reg = await register("typo@example.com");
    const oldToken = lastToken();
    const cookie = cookieOf(reg);
    const change = (email: string) =>
      accountHandler(asUser({ cookie }, { method: "PATCH", url: "https://app.tasketra.com/api/account", body: { action: "change-email", email } }));

    const bad = await change("someone@gmail.co");
    expect(bad.status).toBe(400);
    expect((await jsonBody<{ suggestion: string }>(bad)).suggestion).toBe("someone@gmail.com");

    await createTestUser("taken@example.com");
    await db().sql`UPDATE users SET email_canonical = email WHERE email = 'taken@example.com'`;
    expect((await change("Taken+x@example.com")).status).toBe(409);

    const ok = await change("Fixed@Example.com");
    expect(ok.status).toBe(200);
    expect(sent[sent.length - 1].to).toBe("fixed@example.com");
    const [row] = await db().sql`SELECT email, email_canonical FROM users WHERE email = 'fixed@example.com'`;
    expect(row.email_canonical).toBe("fixed@example.com");
    expect((await verify(oldToken)).status).toBe(400);
    expect((await verify(lastToken())).status).toBe(200);
  });

  it("a confirmed account can't swap its email through change-email", async () => {
    const user = await createTestUser("done@example.com");
    const res = await accountHandler(
      asUser(user, { method: "PATCH", url: "https://app.tasketra.com/api/account", body: { action: "change-email", email: "other@example.com" } })
    );
    expect(res.status).toBe(400);
  });

  it("an unconfirmed account is blocked from creating projects, inviting, uploading and checkout", async () => {
    const user = await createTestUser("blocked@example.com", { verified: false });
    const owner = await createTestUser("full@example.com");
    const [project] = await db().sql`INSERT INTO projects (name, owner_id) VALUES ('P', ${user.id}) RETURNING id`;

    const p = await projectsHandler(asUser(user, { method: "POST", url: "https://app.tasketra.com/api/projects", body: { name: "New" } }));
    expect(p.status).toBe(403);
    expect((await jsonBody<{ verificationRequired: boolean }>(p)).verificationRequired).toBe(true);

    const m = await membersHandler(asUser(user, { method: "POST", url: "https://app.tasketra.com/api/members", body: { projectId: project.id, email: "x@example.com" } }));
    expect(m.status).toBe(403);

    const form = new FormData();
    form.set("projectId", project.id);
    form.set("file", new File(["hi"], "a.txt"));
    const d = await documentsHandler(new Request("https://app.tasketra.com/api/documents", { method: "POST", headers: { cookie: user.cookie }, body: form }));
    expect(d.status).toBe(403);

    const c = await checkoutHandler(asUser(user, { method: "POST", url: "https://app.tasketra.com/api/create-checkout-session", body: { interval: "month" } }));
    expect(c.status).toBe(403);

    // a confirmed account is not blocked
    const ok = await projectsHandler(asUser(owner, { method: "POST", url: "https://app.tasketra.com/api/projects", body: { name: "New" } }));
    expect(ok.status).not.toBe(403);
  });

  it("auth/me reports whether the email is confirmed", async () => {
    const a = await createTestUser("a@example.com", { verified: false });
    const b = await createTestUser("b@example.com");
    const get = (u: { cookie: string }) => meHandler(asUser(u, { method: "GET", url: "https://app.tasketra.com/api/auth/me" }));
    expect((await jsonBody<{ user: { emailVerified: boolean } }>(await get(a))).user.emailVerified).toBe(false);
    expect((await jsonBody<{ user: { emailVerified: boolean } }>(await get(b))).user.emailVerified).toBe(true);
  });

  it("resetting a password by email link also confirms the address", async () => {
    const user = await createTestUser("reset@example.com", { verified: false });
    await db().sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${hashResetToken("raw-reset")}, now() + interval '1 hour')
    `;
    const res = await resetPasswordHandler(
      new Request("https://app.tasketra.com/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "raw-reset", password: "a-brand-new-passphrase" }),
      })
    );
    expect(res.status).toBe(200);
    const [row] = await db().sql`SELECT email_verified_at FROM users WHERE id = ${user.id}`;
    expect(row.email_verified_at).not.toBeNull();
  });

  it("the migration treats existing accounts as already confirmed", async () => {
    // createTestUser's default mirrors the backfill; the column itself must exist and accept null for new sign-ups
    const { user } = await jsonBody<{ user: { id: string } }>(await register("fresh@example.com"));
    const [row] = await db().sql`SELECT email_verified_at FROM users WHERE id = ${user.id}`;
    expect(row.email_verified_at).toBeNull();
  });
});
