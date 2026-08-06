# Tasketra — Requirements Specification

## 1. Product Vision

Tasketra is a project management tool built exclusively for project managers — not developers, not general "work management" for any team. Every other major tool in this space (Jira, Asana, monday.com, ClickUp) was built for a broader audience and bolted on PM-specific features later, or was built for engineering workflows and never really translates to a PM running cross-functional, stakeholder-heavy delivery work.

Tasketra exists to answer three specific, well-documented complaints that no competitor addresses well at once:

1. **PMs are given responsibility without authority.** They're treated as note-takers, decisions get made around them, and there's no clean record of who agreed to what and when. ("Punching bag with a calendar.")
2. **PM work is fragmented across too many disconnected tools.** Status lives in one tool, decisions happen over email or Slack, tasks live somewhere else, and stakeholders never see the whole picture in one place. ("Tool fatigue.")
3. **Existing tools are built for developers, not PMs.** Jira in particular is unusable for non-technical stakeholders and assumes engineering workflows (sprints, backlogs, tickets) that don't map to how a PM actually thinks about a project (milestones, stakeholders, risk, decisions).

## 2. Target User

A single, sharply defined persona: **a project manager or PMO lead running cross-functional delivery work**, typically with stakeholders who are not in the tool day-to-day (executives, clients, department heads). Not aimed at engineering teams managing sprints. Not aimed at general "team productivity." If a feature doesn't serve this PM directly, it's out of scope for v1.

## 3. Core Differentiators (MVP)

### 3.1 Decision Records — the authority feature
The single most differentiated feature. A PM creates a **Decision Request**: a title, context/description, a set of options (or a simple approve/reject), and an optional deadline. Tasketra generates a shareable link. The stakeholder opens that link — **no account or login required** — reviews the request, and submits their choice along with their name. The moment they submit, Tasketra creates an immutable, timestamped **Decision Record**: "Approved by Jane Smith, July 29, 2026, 3:42 PM."

This gives the PM something no other tool provides out of the box: a clean, defensible paper trail they can point back to when a stakeholder later disputes a decision or scope creeps back in. It directly answers the "no real authority" complaint by making the record of authority tangible and easy to produce.

### 3.2 Unified Project Feed — the anti-fragmentation feature
Every project has a single home screen: **one chronological feed** combining task status changes, decision requests/records, and stakeholder comments — instead of a PM stitching together Jira + Slack + email + a spreadsheet to reconstruct "what actually happened on this project this week." Filters let the PM narrow the feed (decisions only, tasks only, a specific stakeholder), but the default view is everything, together, in order.

### 3.3 PM-first design — not a dev tool wearing a PM costume
Plain-English task states (Not Started / In Progress / Blocked / Done — no "backlog," "sprint," or "epic" unless the PM explicitly enables an "agile terminology" toggle in settings). Stakeholders are first-class objects in the data model (not an afterthought), with their own contact info, role, and a log of every decision and comment tied to them. No feature exists in v1 that only makes sense for an engineering audience.

## 4. MVP Feature List

- Single-user authenticated account (email + password)
- Create/edit/archive **Projects**
- Add **Stakeholders** to a project (name, email, role/title)
- Create/edit/complete **Tasks** within a project (title, owner, due date, status, linked stakeholder optional)
- Create **Decision Requests**, generate a public shareable link, collect a response with no login required, and produce a **Decision Record**
- Post free-text **Status Updates** to a project's feed
- **Unified Project Feed**: combined, filterable, chronological view of tasks changes + decisions + status updates
- Project dashboard: at-a-glance status (open decisions awaiting response, overdue tasks, recent activity)
- Email notification when a stakeholder responds to a Decision Request
- Export a project's Decision Records as a simple audit-trail document (for board meetings, retros, disputes)

## 5. Explicitly Out of Scope for MVP

- Multi-tenant billing/subscription management
- Team accounts / multiple PM users collaborating on the same project
- Gantt charts, resource leveling, critical path calculation
- Native mobile apps
- Deep third-party integrations (Slack, MS Teams, Jira import) — noted as fast-follow, not v1
- Granular permissions/roles beyond "PM" and "external stakeholder responding to a link"

## 6. Non-Functional Requirements

- Must be usable by a non-technical stakeholder with zero onboarding (the Decision Record link has to work for someone who has never seen the tool before, on a phone, with no instructions).
- Page loads under 2 seconds on a standard connection.
- Data persists in a real relational database, not local storage or mock data — this is a working tool, not a prototype.
- Passwords hashed, sessions signed — not production-hardened multi-tenant security, but not naive either.

## 7. Success Criteria for This MVP

A real project can be created, stakeholders added, a decision requested and resolved via a shareable link with no login, tasks tracked to completion, and the whole history reviewed as one feed — live, on a real URL, with real data persisting between sessions.
