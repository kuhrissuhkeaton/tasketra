import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import { checkRateLimit } from "../lib/rate-limit.ts";
import { authenticateApiToken } from "../lib/apiTokens.ts";
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

// Tasketra's MCP server (v169): a stateless JSON-RPC endpoint that a user's
// own AI client (Claude, ChatGPT, or any MCP client) calls with the
// personal API token the user created in Account settings. This version is
// read-only — the seven tools below. Write tools arrive in v170 behind the
// token's scope.
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

type ToolName = (typeof TOOLS)[number]["name"];

async function callTool(database: any, userId: string, name: string, args: any) {
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
      return rpcResult(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tasketra", version: "1.0.0" },
        instructions:
          "Tasketra project data for the connected account. This connection is read-only: use the tools to answer questions about the user's projects, tasks, decisions, and risks. Never invent a status, date, or number that a tool did not return.",
      });
    }
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string") return rpcError(msg.id, -32602, "tools/call needs a tool name.");
      try {
        const data = await callTool(database, auth.userId, name, msg.params?.arguments ?? {});
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
