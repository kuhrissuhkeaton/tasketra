import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { loadStageInputs } from "../lib/stageData.ts";
import { monitorBand, stageChecklist } from "../lib/stageChecklist.ts";

// Read-only lens behind the stage rail and "Next up" panel on Home. It counts
// what already exists in the project and hands the counts to the pure rules in
// lib/stageChecklist.ts. Changing a project's stage is a PATCH on /api/project.

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId required" }, { status: 400 });
  if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

  const inputs = await loadStageInputs(db(), projectId);
  if (!inputs) return json({ error: "Not found" }, { status: 404 });
  const { stage, size, counts, escalations, gatesEnabled } = inputs;

  return json({ stage, gatesEnabled, checklist: stageChecklist(stage, counts, size), band: monitorBand(stage, counts, escalations) });
});

export const config: Config = { path: "/api/stage" };
