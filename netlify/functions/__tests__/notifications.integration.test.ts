import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import { db } from "../../lib/db.ts";
import handler from "../notifications.mts";

const URL = "https://app.tasketra.com/api/notifications";
type Body = { items: { id: string; type: string; text: string; unread: boolean; to: string }[]; whatsNewSeen: string | null };

async function addDecisionAnswer(projectId: string, title: string, responder = "Sam", option = "Approve") {
  const [req] = await db().sql`
    INSERT INTO decision_requests (project_id, title, options, public_token)
    VALUES (${projectId}, ${title}, '["Approve","Reject"]'::jsonb, ${crypto.randomUUID()})
    RETURNING id
  `;
  await db().sql`
    INSERT INTO decision_records (decision_request_id, chosen_option, responder_name)
    VALUES (${req.id}, ${option}, ${responder})
  `;
  return req.id as string;
}

async function get(user: { cookie: string }) {
  const res = await handler(asUser(user, { method: "GET", url: URL }));
  expect(res.status).toBe(200);
  return jsonBody<Body>(res);
}

describe("notifications", () => {
  beforeAll(async () => { await setupTestDb(); }, 30000);
  afterAll(async () => { await teardownTestDb(); });
  beforeEach(async () => { await resetTestDb(); delete process.env.ADMIN_EMAIL; });
  afterEach(() => { delete process.env.ADMIN_EMAIL; });

  it("rejects a signed-out request", async () => {
    expect((await handler(new Request(URL))).status).toBe(401);
    expect((await handler(new Request(URL, { method: "PATCH", body: "{}" }))).status).toBe(401);
  });

  it("is empty for a new account, and a new sign-up has not seen any What's new version yet", async () => {
    const user = await createTestUser("new@example.com");
    const body = await get(user);
    expect(body.items).toEqual([]);
    expect(body.whatsNewSeen).toBeNull();
  });

  it("tells the project owner when a stakeholder answers a decision, as unread until marked read", async () => {
    const owner = await createTestUser("owner@example.com");
    const project = await createTestProject(owner.id);
    await db().sql`UPDATE users SET notifications_seen_at = now() - interval '1 hour' WHERE id = ${owner.id}`;
    await addDecisionAnswer(project.id, "Pick a vendor", "Maya", "Approve");

    const body = await get(owner);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("decision_response");
    expect(body.items[0].text).toContain("Maya");
    expect(body.items[0].text).toContain("Pick a vendor");
    expect(body.items[0].unread).toBe(true);
    expect(body.items[0].to).toBe(`/app/projects/${project.id}?tab=decisions`);

    const mark = await handler(asUser(owner, { method: "PATCH", url: URL, body: { markAllRead: true } }));
    expect(mark.status).toBe(200);
    const after = await get(owner);
    expect(after.items).toHaveLength(1); // still listed for 30 days
    expect(after.items[0].unread).toBe(false);
  });

  it("tells active members too, but not outsiders or invited-only people", async () => {
    const owner = await createTestUser("owner2@example.com");
    const member = await createTestUser("member@example.com");
    const invited = await createTestUser("invited@example.com");
    const outsider = await createTestUser("outsider@example.com");
    const project = await createTestProject(owner.id);
    await db().sql`
      INSERT INTO project_members (project_id, user_id, invited_email, status)
      VALUES (${project.id}, ${member.id}, 'member@example.com', 'active'),
             (${project.id}, ${invited.id}, 'invited@example.com', 'invited')
    `;
    await db().sql`UPDATE users SET notifications_seen_at = now() - interval '1 hour'`;
    await addDecisionAnswer(project.id, "Scope change");

    expect((await get(member)).items).toHaveLength(1);
    expect((await get(invited)).items).toHaveLength(0);
    expect((await get(outsider)).items).toHaveLength(0);
  });

  it("ignores answers on deleted decisions and deleted projects", async () => {
    const owner = await createTestUser("owner3@example.com");
    const project = await createTestProject(owner.id);
    const deletedDecision = await addDecisionAnswer(project.id, "Gone decision");
    await db().sql`UPDATE decision_requests SET deleted_at = now() WHERE id = ${deletedDecision}`;
    expect((await get(owner)).items).toHaveLength(0);

    await addDecisionAnswer(project.id, "Visible");
    expect((await get(owner)).items).toHaveLength(1);
    await db().sql`UPDATE projects SET deleted_at = now() WHERE id = ${project.id}`;
    expect((await get(owner)).items).toHaveLength(0);
  });

  it("tells a person when their own feedback is planned or shipped, not other people's", async () => {
    const maya = await createTestUser("maya@example.com");
    const other = await createTestUser("other@example.com");
    await db().sql`UPDATE users SET notifications_seen_at = now() - interval '1 hour'`;
    await db().sql`
      INSERT INTO feedback (user_id, message, status) VALUES
        (${maya.id}, 'Please add dark mode', 'shipped'),
        (${maya.id}, 'A thing we dismissed', 'dismissed'),
        (${maya.id}, 'Still new', 'new'),
        (${other.id}, 'Someone else idea', 'shipped')
    `;
    const body = await get(maya);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].type).toBe("feedback_update");
    expect(body.items[0].text).toContain("shipped");
    expect(body.items[0].text).toContain("Please add dark mode");
    expect(body.items[0].unread).toBe(true);
  });

  it("shows the admin a count of untriaged feedback, and nobody else", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    const admin = await createTestUser("admin@example.com");
    const plain = await createTestUser("plain@example.com");
    await db().sql`UPDATE users SET notifications_seen_at = now() - interval '1 hour'`;
    await db().sql`
      INSERT INTO feedback (user_id, message, status) VALUES
        (${plain.id}, 'one', 'new'), (${plain.id}, 'two', 'new'), (${plain.id}, 'three', 'planned')
    `;
    const adminBody = await get(admin);
    const inbox = adminBody.items.find((i) => i.type === "feedback_inbox");
    expect(inbox).toBeTruthy();
    expect(inbox!.text).toContain("2 new");
    expect(inbox!.to).toBe("/admin/feedback");
    expect(inbox!.unread).toBe(true);

    const plainBody = await get(plain);
    expect(plainBody.items.find((i) => i.type === "feedback_inbox")).toBeUndefined();
  });

  it("nobody is admin when ADMIN_EMAIL is not set", async () => {
    const user = await createTestUser("admin@example.com");
    await db().sql`INSERT INTO feedback (user_id, message) VALUES (${user.id}, 'x')`;
    const body = await get(user);
    expect(body.items.find((i) => i.type === "feedback_inbox")).toBeUndefined();
  });

  it("remembers the last What's new version seen and rejects bad values", async () => {
    const user = await createTestUser("seen@example.com");
    const ok = await handler(asUser(user, { method: "PATCH", url: URL, body: { whatsNewSeen: "v100" } }));
    expect(ok.status).toBe(200);
    expect((await get(user)).whatsNewSeen).toBe("v100");

    for (const bad of ["", "100", "v100; DROP TABLE users", 100, null]) {
      const res = await handler(asUser(user, { method: "PATCH", url: URL, body: { whatsNewSeen: bad } }));
      expect(res.status).toBe(400);
    }
    const empty = await handler(asUser(user, { method: "PATCH", url: URL, body: {} }));
    expect(empty.status).toBe(400);
    expect((await get(user)).whatsNewSeen).toBe("v100");
  });

  it("rejects other methods", async () => {
    const user = await createTestUser("m@example.com");
    const res = await handler(asUser(user, { method: "DELETE", url: URL }));
    expect(res.status).toBe(405);
  });
});
