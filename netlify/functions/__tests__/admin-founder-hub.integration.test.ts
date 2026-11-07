import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, resetTestDb } from "../../lib/__tests__/testDb.ts";
import { createTestUser, createTestProject, asUser, jsonBody } from "./fixtures.ts";
import handler from "../admin-founder-hub.mts";
import { db } from "../../lib/db.ts";

// Founder Hub (v152): strict-admin, GET-only, read-only aggregates —
// milestones, revenue from the subscriptions mirror, cohort breakdown,
// activation funnel, feature usage, and friction.

const URL = "https://app.tasketra.com/api/admin-founder-hub";
const ADMIN = "admin@example.com";

async function setup() {
  process.env.ADMIN_EMAIL = ADMIN;
  const admin = await createTestUser(ADMIN, { foundingMember: true });
  return { admin };
}

const get = (user: { cookie: string }) => handler(asUser(user, { method: "GET", url: URL }));

async function addSubscription(userId: string, status: string, interval: string | null, opts: { trialEnd?: string; updatedDaysAgo?: number } = {}) {
  const database = db();
  const updated = new Date(Date.now() - (opts.updatedDaysAgo ?? 0) * 24 * 60 * 60 * 1000).toISOString();
  await database.sql`
    INSERT INTO subscriptions (user_id, stripe_customer_id, status, billing_interval, trial_end, updated_at)
    VALUES (${userId}, ${"cus_" + crypto.randomUUID().slice(0, 8)}, ${status}, ${interval}, ${opts.trialEnd ?? null}, ${updated})
  `;
}

describe("admin-founder-hub", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await resetTestDb();
    delete process.env.ADMIN_EMAIL;
  });
  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
  });

  describe("who may use it", () => {
    it("rejects an unauthenticated request", async () => {
      expect((await handler(new Request(URL))).status).toBe(401);
    });

    it("fails closed when ADMIN_EMAIL is not set", async () => {
      const someone = await createTestUser("someone@example.com", { foundingMember: true });
      expect((await get(someone)).status).toBe(403);
    });

    it("rejects a signed-in user who is not the admin", async () => {
      await setup();
      const other = await createTestUser("other@example.com");
      expect((await get(other)).status).toBe(403);
    });

    it("rejects writes: every non-GET method is a 405, even for the admin", async () => {
      const { admin } = await setup();
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect((await handler(asUser(admin, { method, url: URL, body: {} }))).status).toBe(405);
      }
    });
  });

  describe("the seeded world", () => {
    it("computes cohorts, revenue, milestones, funnel, usage, and friction exactly", async () => {
      const { admin } = await setup();
      const database = db();

      // Founding: one subscriber (money must show as founding, never GA),
      // one plain member. With the founding admin, freeForever = 3.
      const foundingSub = await createTestUser("founding-sub@example.com", { foundingMember: true });
      await createTestUser("founding-plain@example.com", { foundingMember: true });
      await addSubscription(foundingSub.id, "active", "month");

      // The beta test account with an active subscription: the trap. It
      // must not count anywhere in GA.
      const beta = await createTestUser("beta@tasketra.com");
      await addSubscription(beta.id, "active", "month");

      // GA users.
      const gaAnnual = await createTestUser("ga-annual@example.com");
      await addSubscription(gaAnnual.id, "active", "year");
      const gaTrial = await createTestUser("ga-trial@example.com");
      await addSubscription(gaTrial.id, "trialing", "month", { trialEnd: "2026-11-20T00:00:00.000Z" });
      const gaPastDue = await createTestUser("ga-pastdue@example.com");
      await addSubscription(gaPastDue.id, "past_due", "month");
      const gaFree = await createTestUser("ga-free@example.com", { verified: false });
      const gaCanceled = await createTestUser("ga-canceled@example.com");
      await addSubscription(gaCanceled.id, "canceled", "month", { updatedDaysAgo: 2 });

      // Activation for gaAnnual: project + task + check-in + decision.
      const p = await createTestProject(gaAnnual.id, "GA Project");
      await database.sql`INSERT INTO tasks (project_id, title, status) VALUES (${p.id}, 'First task', 'not_started')`;
      await database.sql`INSERT INTO status_updates (project_id, body) VALUES (${p.id}, 'Kicked off')`;
      await database.sql`INSERT INTO decision_requests (project_id, title, status, options, public_token) VALUES (${p.id}, 'Pick a date', 'open', '["Fri", "Sat"]'::jsonb, 'tok-fh')`;
      // gaTrial has a project only.
      await createTestProject(gaTrial.id, "Trial Project");

      // Usage: 3 task, 1 roadmap_item, 2 decision, 1 status_update rows.
      for (let i = 0; i < 3; i++) {
        await database.sql`INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id) VALUES (${p.id}, 'task', gen_random_uuid(), 'T', 'created', ${gaAnnual.id})`;
      }
      for (let i = 0; i < 2; i++) {
        await database.sql`INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id) VALUES (${p.id}, 'decision', gen_random_uuid(), 'D', 'created', ${gaAnnual.id})`;
      }
      await database.sql`INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id) VALUES (${p.id}, 'roadmap_item', gen_random_uuid(), 'R', 'created', ${gaAnnual.id})`;
      await database.sql`INSERT INTO activity_log (project_id, entity_type, entity_id, entity_title, action, actor_id) VALUES (${p.id}, 'status_update', gen_random_uuid(), 'S', 'created', ${gaAnnual.id})`;

      // Friction: feedback across statuses and ages, one pulse send.
      await database.sql`INSERT INTO feedback (user_id, message, status, created_at) VALUES (${gaAnnual.id}, 'fresh', 'new', now())`;
      await database.sql`INSERT INTO feedback (user_id, message, status, created_at) VALUES (${gaAnnual.id}, 'old', 'new', now() - interval '40 days')`;
      await database.sql`INSERT INTO feedback (user_id, message, status) VALUES (${gaAnnual.id}, 'p', 'planned')`;
      await database.sql`INSERT INTO feedback (user_id, message, status) VALUES (${gaAnnual.id}, 's', 'shipped')`;
      await database.sql`INSERT INTO feedback (user_id, message, status) VALUES (${gaAnnual.id}, 'd', 'dismissed')`;
      await database.sql`UPDATE users SET last_pulse_sent_at = now() WHERE id = ${gaAnnual.id}`;

      const body = await jsonBody<any>(await get(admin));

      // Cohorts: every account in exactly one bucket, summing to total.
      expect(body.users.total).toBe(9);
      expect(body.users.cohorts).toEqual({ freeForever: 3, inTrial: 1, payingMonthly: 2, payingYearly: 1, freeRegular: 2 });
      const cohortSum = Object.values(body.users.cohorts as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(cohortSum).toBe(body.users.total);

      // Revenue: GA payers = annual active + monthly trialing + monthly
      // past_due (founding and beta excluded). MRR includes past_due,
      // excludes trialing.
      expect(body.revenue.gaPayers).toBe(3);
      expect(body.revenue.gaMrr).toBeCloseTo(290 / 12 + 29, 2);
      expect(body.revenue.payersByPlan).toEqual({ payingMonthly: 0, payingYearly: 1, trialingMonthly: 1, trialingYearly: 0 });
      expect(body.revenue.trials.count).toBe(1);
      expect(body.revenue.trials.trialEnds).toHaveLength(1);
      expect(body.revenue.pastDue).toEqual({ count: 1, mrrAtRisk: 29 });
      expect(body.revenue.foundingSubscribers).toMatchObject({ active: 1, trialing: 0, pastDue: 0 });
      expect(body.revenue.foundingSubscribers.mrr).toBe(29);

      // Milestones: rungs 1-2 achieved, 3 is next, churn unmeasurable.
      const byId = Object.fromEntries(body.milestones.rungs.map((r: any) => [r.id, r]));
      expect(byId["first-ga-paying"].state).toBe("achieved");
      expect(byId["first-annual-payer"].state).toBe("achieved");
      expect(byId["ten-ga-payers"].state).toBe("pending");
      expect(byId["churn-under-5"].state).toBe("not_measurable");
      expect(byId["churn-under-5"].current).toBeNull();
      expect(body.milestones.nextMilestone).toMatchObject({ label: "10 GA payers", current: 3, target: 10 });

      // Funnel over the 5 GA users.
      const funnel = Object.fromEntries(body.users.funnel.map((s: any) => [s.key, s.count]));
      expect(funnel).toEqual({ signed_up: 5, verified: 4, created_project: 2, added_task: 1, posted_checkin: 1, created_decision: 1 });

      // Signups per week covers the trailing 12 weeks and sums to total.
      expect(body.users.signupsPerWeek).toHaveLength(12);
      expect(body.users.signupsPerWeek.reduce((a: number, w: any) => a + w.count, 0)).toBe(9);

      // Usage ranking, distinct counts, rarely-used, and depth.
      expect(body.usage.sections[0]).toMatchObject({ section: "Tasks", actions30d: 3, distinctProjects: 1, distinctUsers: 1 });
      const usageBySection = Object.fromEntries(body.usage.sections.map((s: any) => [s.section, s.actions30d]));
      expect(usageBySection["Decisions"]).toBe(2);
      expect(usageBySection["Roadmap"]).toBe(1);
      expect(usageBySection["Overview (check-ins / feed)"]).toBe(1);
      expect(body.usage.rarelyUsed).toContain("Issues");
      expect(body.usage.rarelyUsed).toContain("Budget*");
      expect(body.usage.depth).toMatchObject({ medianActionsPerProject: 7, medianSectionsPerProject: 4, activeProjects30d: 1 });

      // Friction.
      expect(body.friction.feedback.byStatus).toEqual({ new: 2, planned: 1, shipped: 1, dismissed: 1 });
      expect(body.friction.feedback.newLast7d).toBe(1);
      expect(body.friction.feedback.newLast30d).toBe(1);
      expect(body.friction.feedback.oldestNewAgeDays).toBeGreaterThanOrEqual(39);
      expect(body.friction.pulseSent30d).toBe(1);
      expect(body.friction.cancellations30d).toBe(1);
    });
  });

  describe("milestone edge cases", () => {
    it("a trialing-only GA cohort does not trip rung 1, and trial MRR is $0", async () => {
      const { admin } = await setup();
      const ga = await createTestUser("only-trial@example.com");
      await addSubscription(ga.id, "trialing", "month", { trialEnd: "2026-11-21T00:00:00.000Z" });
      const body = await jsonBody<any>(await get(admin));
      const rung1 = body.milestones.rungs.find((r: any) => r.id === "first-ga-paying");
      expect(rung1.state).toBe("pending");
      expect(rung1.current).toBe(0);
      expect(body.milestones.nextMilestone).toMatchObject({ label: "First GA paying customer", current: 0, target: 1 });
      expect(body.revenue.gaMrr).toBe(0);
      expect(body.revenue.trials.count).toBe(1);
      expect(body.users.cohorts.inTrial).toBe(1);
    });

    it("founding and beta subscribers do not trip rung 1", async () => {
      const { admin } = await setup();
      const founding = await createTestUser("founder-pays@example.com", { foundingMember: true });
      await addSubscription(founding.id, "active", "month");
      const beta = await createTestUser("beta@tasketra.com");
      await addSubscription(beta.id, "active", "month");
      const body = await jsonBody<any>(await get(admin));
      expect(body.revenue.gaPayers).toBe(0);
      expect(body.revenue.gaMrr).toBe(0);
      expect(body.milestones.rungs.find((r: any) => r.id === "first-ga-paying").state).toBe("pending");
      expect(body.revenue.foundingSubscribers.active).toBe(1);
      // ...and both still land somewhere in the cohort breakdown.
      expect(body.users.cohorts.freeForever).toBe(2); // admin + founding
      expect(body.users.cohorts.payingMonthly).toBe(1); // beta (all-accounts view)
    });

    it("the admin's own subscription does not count as GA (Flag D3)", async () => {
      // Deliberately NOT founding: only the admin exclusion (not the
      // founding exclusion) can keep this account out of GA.
      process.env.ADMIN_EMAIL = ADMIN;
      const admin = await createTestUser(ADMIN);
      await addSubscription(admin.id, "active", "year");
      const body = await jsonBody<any>(await get(admin));
      expect(body.revenue.gaPayers).toBe(0);
      expect(body.revenue.gaMrr).toBe(0);
      expect(body.users.funnel[0].count).toBe(0); // GA set is empty
    });

    it("a canceled-only GA user trips nothing", async () => {
      const { admin } = await setup();
      const ga = await createTestUser("canceled@example.com");
      await addSubscription(ga.id, "canceled", "month");
      const body = await jsonBody<any>(await get(admin));
      expect(body.revenue.gaPayers).toBe(0);
      expect(body.users.cohorts.freeRegular).toBe(1);
      expect(body.milestones.rungs.find((r: any) => r.id === "first-ga-paying").state).toBe("pending");
    });

    it("MRR with only annual payers uses 290/12, not 290", async () => {
      const { admin } = await setup();
      const ga = await createTestUser("annual@example.com");
      await addSubscription(ga.id, "active", "year");
      const body = await jsonBody<any>(await get(admin));
      expect(body.revenue.gaMrr).toBeCloseTo(290 / 12, 2);
      expect(body.revenue.gaMrr).not.toBe(290);
    });
  });
});
