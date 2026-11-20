import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { authenticateApiToken } from "../lib/apiTokens.ts";
import { runWithUser } from "../lib/requestContext.ts";
import {
  McpToolError,
  mcpListProjects,
  mcpGetProjectOverview,
  mcpListTasks,
  mcpGetDecisionsWaiting,
  mcpListRisks,
  mcpGetToday,
  mcpGetWeeklySync,
} from "../lib/mcpData.ts";
import {
  mcpCreateTask,
  mcpUpdateTask,
  mcpAddDecisionRequest,
  mcpAddRisk,
  mcpAddStatusUpdate,
} from "../lib/mcpWrite.ts";

// Tasketra's MCP server (v169 read tools, v170 write tools): a stateless
// JSON-RPC endpoint that a user's own AI client (Claude, ChatGPT, or any
// MCP client) calls with the personal API token the user created in
// Account settings. Read tools work for every token; the five write tools
// work only for tokens created with the read + write scope, enforced on
// every call below. Every write lands in the project's activity log under
// the token owner's name with a "via MCP" marker.
//
// Stateless by design: no session is kept between calls, every request
// carries its Bearer token, and responses are plain JSON (no streaming),
// which is the simplest shape the MCP Streamable HTTP transport allows and
// the one every major client accepts.

const KNOWN_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"];
const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

const TOOLS = [
  {
    name: "list_projects",
    description:
      "List the projects in this Tasketra account, with each project's stage and counts of open decisions and overdue tasks. Start here to find project ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_project_overview",
    description:
      "The full picture for one project: the project manager's latest stated status and check-in note, completion / time used / budget used, work broken down by phase, milestones, the top risks in plain words, and open decisions with who owns them and when they are needed by.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "A project id from list_projects." } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description: "List a project's tasks with their status, due date, and owner. Defaults to open tasks only.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        status: { type: "string", enum: ["open", "done", "all"], description: "Which tasks to return. Default open." },
        overdue_only: { type: "boolean", description: "Return only overdue open tasks. Default false." },
      },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_decisions_waiting",
    description:
      "Every open decision across the account's projects, soonest needed-by first, with the project, the owner if one is named, and how many days it has been waiting.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_risks",
    description: "A project's open risks, highest exposure first, with probability, impact, mitigation, and owner.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "A project id from list_projects." } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_today",
    description:
      "What's on the account owner's plate today across all their projects: overdue tasks, tasks due today, the total open count, and how many tasks were finished in the last two days.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_weekly_sync",
    description:
      "The inputs for one project's weekly sync: its latest check-in (stated health and note), open asks (decisions waiting, with owners and needed-by dates), overdue tasks, and how many tasks finished in the last 7 days.",
    inputSchema: {
      type: "object",
      properties: { project_id: { type: "string", description: "A project id from list_projects." } },
      required: ["project_id"],
      additionalProperties: false,
    },
  },
] as const;

const WRITE_TOOLS = [
  {
    name: "create_task",
    description:
      "Add a task to a project. Only for read + write tokens. The task starts as not started; the change is recorded in the project's activity log as made via MCP.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        title: { type: "string", description: "The task title." },
        due_date: { type: "string", description: "Optional due date, YYYY-MM-DD." },
        description: { type: "string", description: "Optional longer description of the task." },
      },
      required: ["project_id", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task",
    description:
      "Change a task in a project: its status, due date, or description. Only for read + write tokens. Pass only the fields to change; due_date can be null to clear the date. The change is recorded in the project's activity log as made via MCP.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        task_id: { type: "string", description: "A task id from list_tasks." },
        status: { type: "string", enum: ["not_started", "in_progress", "blocked", "done"], description: "The new status." },
        due_date: { type: ["string", "null"], description: "The new due date, YYYY-MM-DD, or null to clear it." },
        description: { type: ["string", "null"], description: "The new description, or null to clear it." },
      },
      required: ["project_id", "task_id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_decision_request",
    description:
      "Open a new decision on a project, with the date it is needed by. Only for read + write tokens. The change is recorded in the project's activity log as made via MCP.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        title: { type: "string", description: "The decision to be made, phrased as the ask." },
        needed_by: { type: "string", description: "The date the decision is needed by, YYYY-MM-DD." },
        context: { type: "string", description: "Optional background on why the decision is needed." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of the choices on the table; when given, at least two.",
        },
        owner_stakeholder_id: {
          type: "string",
          description: "Optional id of the stakeholder accountable for the decision, from this project's stakeholders.",
        },
      },
      required: ["project_id", "title", "needed_by"],
      additionalProperties: false,
    },
  },
  {
    name: "add_risk",
    description:
      "Add a risk to a project's register with its probability and impact. Only for read + write tokens. The change is recorded in the project's activity log as made via MCP.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        title: { type: "string", description: "The risk, in a short phrase." },
        probability: { type: "string", enum: ["low", "medium", "high"], description: "How likely the risk is to happen." },
        impact: { type: "string", enum: ["low", "medium", "high"], description: "How much it matters if it happens." },
        description: { type: "string", description: "Optional longer description of the risk." },
        mitigation: { type: "string", description: "Optional note on what is being done about it." },
      },
      required: ["project_id", "title", "probability", "impact"],
      additionalProperties: false,
    },
  },
  {
    name: "add_status_update",
    description:
      "Post a check-in on a project: its stated health (on track, at risk, or off track) plus an optional note. Only for read + write tokens. This becomes the project's latest stated status, the same as a check-in posted in the app, and is recorded in the activity log as made via MCP.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "A project id from list_projects." },
        health: { type: "string", enum: ["on_track", "at_risk", "off_track"], description: "The project's stated health." },
        note: { type: "string", description: "Optional check-in note." },
      },
      required: ["project_id", "health"],
      additionalProperties: false,
    },
  },
] as const;

const ALL_TOOLS = [...TOOLS, ...WRITE_TOOLS];
const WRITE_TOOL_NAMES = new Set<string>(WRITE_TOOLS.map((t) => t.name));

type ToolName = (typeof ALL_TOOLS)[number]["name"];

async function callTool(database: any, userId: string, scope: string, name: string, args: any) {
  if (WRITE_TOOL_NAMES.has(name) && scope !== "write") {
    throw new McpToolError(
      "This token is read-only, so it cannot make changes. To allow updates, create a read + write token in Tasketra under Account, Connect your AI, and reconnect with that token."
    );
  }
  switch (name as ToolName) {
    case "list_projects":
      return mcpListProjects(database, userId);
    case "get_project_overview":
      return mcpGetProjectOverview(database, userId, args);
    case "list_tasks":
      return mcpListTasks(database, userId, args);
    case "get_decisions_waiting":
      return mcpGetDecisionsWaiting(database, userId);
    case "list_risks":
      return mcpListRisks(database, userId, args);
    case "get_today":
      return mcpGetToday(database, userId);
    case "get_weekly_sync":
      return mcpGetWeeklySync(database, userId, args);
    case "create_task":
      return mcpCreateTask(database, userId, args);
    case "update_task":
      return mcpUpdateTask(database, userId, args);
    case "add_decision_request":
      return mcpAddDecisionRequest(database, userId, args);
    case "add_risk":
      return mcpAddRisk(database, userId, args);
    case "add_status_update":
      return mcpAddStatusUpdate(database, userId, args);
    default:
      throw new McpToolError(`Unknown tool: ${name}`);
  }
}

function rpcResult(id: unknown, result: unknown) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

export default withSentry(async (req: Request) => {
  if (req.method !== "POST") {
    return rpcError(null, -32600, "This MCP server accepts POST requests only.", 405);
  }
  const rawBody = await req.text();
  let msg: any;
  try {
    msg = JSON.parse(rawBody);
  } catch {
    return rpcError(null, -32700, "Request body was not valid JSON.", 400);
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.method !== "string") {
    return rpcError(null, -32600, "Expected a single JSON-RPC request object.");
  }
  // Notifications carry no id and expect no response.
  if (msg.id === undefined || msg.id === null || msg.method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  const database = db();
  const auth = await authenticateApiToken(database, req);
  if (!auth) {
    return rpcError(
      msg.id,
      -32001,
      "Missing or invalid API token. Create one in Tasketra under Account, Connect your AI, and send it as an Authorization: Bearer header.",
      401
    );
  }
  const withinLimit = await checkRateLimit(database, `mcp:token:${auth.tokenId}`, 300, 15);
  if (!withinLimit) {
    return rpcError(msg.id, -32002, "Too many requests from this token. Wait a few minutes and try again.", 429);
  }

  switch (msg.method) {
    case "initialize": {
      const requested = msg.params?.protocolVersion;
      const protocolVersion = KNOWN_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
      const canWrite = auth.scope === "write";
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tasketra", version: "1.1.0" },
        instructions: canWrite
          ? "Tasketra project data for the connected account. This token can read and write: use the read tools to answer questions about the user's projects, tasks, decisions, and risks, and the write tools to make the updates the user asks for. Every write is recorded in the project's activity log as made via MCP. Never invent a status, date, or number that a tool did not return, and never set a value the user did not state."
          : "Tasketra project data for the connected account. This connection is read-only: use the tools to answer questions about the user's projects, tasks, decisions, and risks. Never invent a status, date, or number that a tool did not return.",
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: auth.scope === "write" ? ALL_TOOLS : TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string") return rpcError(msg.id, -32602, "tools/call needs a tool name.");
      try {
        // Writes record their actor through logActivity's request context,
        // which normally comes from a session cookie MCP calls do not
        // carry — so the call runs as the token owner explicitly.
        const data = await runWithUser(auth.userId, () =>
          callTool(database, auth.userId, auth.scope, name, msg.params?.arguments ?? {})
        );
        return rpcResult(msg.id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        if (err instanceof McpToolError) {
          return rpcResult(msg.id, { content: [{ type: "text", text: err.message }], isError: true });
        }
        throw err;
      }
    }
    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});

export const config: Config = { path: "/api/mcp" };
