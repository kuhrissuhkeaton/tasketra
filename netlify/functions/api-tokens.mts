import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  isApiTokenScope,
  isFoundingMember,
} from "../lib/apiTokens.ts";

// Manages the signed-in user's personal API tokens for the MCP server
// (v169). Session-cookie auth, like every other account endpoint — the
// tokens themselves are only ever presented to /api/mcp, never here.
// Creating a token is founding-members-only while MCP is in beta.

export default withSentry(async (req: Request) => {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const tokens = await listApiTokens(database, userId);
    return json({ tokens, founding: await isFoundingMember(database, userId) });
  }

  if (req.method === "POST") {
    if (!(await isFoundingMember(database, userId))) {
      return json(
        { error: "Connecting your own AI is a founding-member beta feature for now." },
        { status: 403 }
      );
    }
    const body = (await req.json().catch(() => null)) as any;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "Give the token a name so you can recognize it later." }, { status: 400 });
    if (name.length > 60) return json({ error: "Token names are capped at 60 characters." }, { status: 400 });
    const scope = body?.scope ?? "read";
    if (!isApiTokenScope(scope)) return json({ error: "scope must be read or write." }, { status: 400 });
    const active = await listApiTokens(database, userId);
    if (active.length >= 10) {
      return json({ error: "You already have 10 active tokens. Revoke one before creating another." }, { status: 400 });
    }
    const { raw, token } = await createApiToken(database, userId, name, scope);
    // The raw token rides along exactly once, in this response. Only its
    // hash is stored, so it can never be shown again.
    return json({ token, raw }, { status: 201 });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json({ error: "id is required." }, { status: 400 });
    const revoked = await revokeApiToken(database, userId, id);
    if (!revoked) return json({ error: "Token not found." }, { status: 404 });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/api-tokens" };
