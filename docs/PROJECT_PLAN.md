# Tasketra — Project Plan

## Phase Sequence

1. **Requirements Specification** — done (`REQUIREMENTS.md`)
2. **Project Plan** — this document
3. **UX/UI Design** — information architecture, core screens, user flows, visual direction (`UX_DESIGN.md`)
4. **Architecture** — tech stack, data model, API design, folder structure (`ARCHITECTURE.md`)
5. **Build** — scaffold the app, implement auth, projects, stakeholders, tasks, decision records, unified feed
6. **Integrations** — email notification on decision response, calendar export (.ics) for task due dates
7. **Testing** — unit tests for core logic (decision-record integrity, task state transitions), manual end-to-end verification of every MVP flow
8. **Deploy** — provision a live Netlify project with its own database, deploy, verify the live URL works end-to-end with real data

## Sequencing Rationale

Decision Records and the Unified Feed are the differentiated core, so the data model and API are designed around them first — everything else (tasks, stakeholders) is built to feed that feed, not the other way around. Auth is minimal by design (single PM user) so it doesn't consume disproportionate build time relative to the features that actually differentiate the product.

## Definition of Done for This MVP

- Deployed to a live URL, not running locally only
- A first-time visitor can: sign in, create a project, add a stakeholder, create a decision request, receive and view a response submitted via the public link with no login, see it reflected in the project's unified feed, and export the audit trail
- Core logic has automated test coverage; the full flow above has been manually verified against the live deployment, not just localhost

## What Happens After This MVP (Not Built Now, Documented for Later)

- Multi-user accounts and permissions
- Billing/subscription tiers
- Slack/Teams/email-inbox integrations for two-way sync
- Native mobile clients
- Gantt/critical-path views for PMs who want them
