import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import { sendEmail } from "../lib/notify.ts";
import { withSentry } from "../lib/sentry.ts";

// Public, unauthenticated endpoint. Only ever exposes the single decision
// request matching an unguessable token -- never a list, never other project data.
//
// v151 (Part D, Option 1): a response is recorded as a RESPONSE. It no
// longer resolves the request -- the project owner confirms one response
// as the outcome in the app (see decisions.mts PATCH action "confirm").
// The GET record is the confirmed outcome, present only once the request
// is resolved (for pre-v151 decisions, their single record).

export default withSentry(async (req: Request) => {
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "token required" }, { status: 400 });

    const [decision] = await database.sql`
      SELECT dr.id, dr.title, dr.context, dr.options, dr.deadline, dr.status, p.name AS project_name
      FROM decision_requests dr
      JOIN projects p ON p.id = dr.project_id
      WHERE dr.public_token = ${token}
    `;
    if (!decision) return json({ error: "This decision link is not valid." }, { status: 404 });

    let record = null;
    if (decision.status === "resolved") {
      const [rec] = await database.sql`
        SELECT chosen_option, responder_name, responded_at, confirmed_at
        FROM decision_records rec
        WHERE rec.decision_request_id = ${decision.id}
          AND (rec.confirmed_at IS NOT NULL
               OR NOT EXISTS (SELECT 1 FROM decision_records c
                              WHERE c.decision_request_id = rec.decision_request_id
                                AND c.confirmed_at IS NOT NULL))
        ORDER BY rec.confirmed_at DESC NULLS LAST, rec.responded_at DESC
        LIMIT 1
      `;
      record = rec || null;
    }

    return json({ decision, record });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null) as any;
    const token = body?.token;
    const chosenOption = (body?.chosenOption || "").trim();
    const responderName = (body?.responderName || "").trim();

    if (!token || !chosenOption || !responderName) {
      return json({ error: "token, chosenOption, and responderName are required." }, { status: 400 });
    }

    const [decision] = await database.sql`
      SELECT id, title, options, status FROM decision_requests WHERE public_token = ${token}
    `;
    if (!decision) return json({ error: "This decision link is not valid." }, { status: 404 });
    if (decision.status === "resolved") {
      return json({ error: "This decision has already been resolved." }, { status: 409 });
    }
    const validOptions: string[] = decision.options;
    if (!validOptions.includes(chosenOption)) {
      return json({ error: "That is not a valid option for this decision." }, { status: 400 });
    }

    const [record] = await database.sql`
      INSERT INTO decision_records (decision_request_id, chosen_option, responder_name)
      VALUES (${decision.id}, ${chosenOption}, ${responderName})
      RETURNING chosen_option, responder_name, responded_at
    `;
    // v151: deliberately NO status flip here. The response collects with
    // any others until the owner confirms the outcome.

    // Best-effort notification to the PM who owns this project. Failure here
    // must never block the stakeholder's response from being recorded.
    try {
      const [owner] = await database.sql`
        SELECT u.email AS owner_email
        FROM decision_requests dr2
        JOIN projects p ON p.id = dr2.project_id
        JOIN users u ON u.id = p.owner_id
        WHERE dr2.id = ${decision.id}
      `;
      if (owner?.owner_email) {
        await sendEmail(
          owner.owner_email,
          `Decision response: ${decision.title}`,
          `${responderName} responded "${chosenOption}" to "${decision.title}". It stays open until you confirm the outcome in Tasketra's Decisions tab.`
        );
      }
    } catch {
      // notification failures are non-fatal
    }

    return json({ record }, { status: 201 });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/decision-public" };
