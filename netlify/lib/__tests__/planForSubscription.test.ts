import { describe, it, expect } from "vitest";
import { planForSubscription, PAST_DUE_GRACE_DAYS } from "../billing.ts";

const now = new Date("2026-10-20T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("planForSubscription", () => {
  it("maps live paid statuses", () => {
    expect(planForSubscription("trialing", null, now)).toBe("trialing");
    expect(planForSubscription("active", null, now)).toBe("active");
  });
  it("keeps Pro during the grace period after a failed payment, then drops to Free", () => {
    expect(planForSubscription("past_due", daysAgo(1), now)).toBe("past_due");
    expect(planForSubscription("past_due", daysAgo(PAST_DUE_GRACE_DAYS - 1), now)).toBe("past_due");
    expect(planForSubscription("past_due", daysAgo(PAST_DUE_GRACE_DAYS + 1), now)).toBe("free");
    expect(planForSubscription("past_due", null, now)).toBe("past_due");
  });
  it("everything else is Free", () => {
    for (const s of ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused", null, undefined]) {
      expect(planForSubscription(s as any, null, now)).toBe("free");
    }
  });
});
