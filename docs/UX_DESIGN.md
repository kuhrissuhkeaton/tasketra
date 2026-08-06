# Tasketra — UX/UI Design

## Design Principle

Every screen should look like it belongs to a PM's professional toolkit — confident and plain-spoken rather than corporate-formal or playful. No emoji, no cutesy micro-copy. The product's whole pitch is "this gives you standing" — the visual design has to feel like it, not undercut it, while staying approachable enough that a stakeholder with zero context can use it on a phone.

## Visual Design System

- **Palette:** deep ink blue-green (`#1B3A4B`) as the primary structure color, a warm amber "momentum" accent (`#E2793D`) used sparingly for primary actions and progress, a warm paper background (`#FAF7F2`), slate for secondary text (`#5C6670`), a muted green for completed states (`#4C7A5E`), and a muted terracotta (`#B6503B`) reserved only for overdue/blocked states.
- **Typography:** Space Grotesk for the wordmark and page titles (confident, geometric, modern — not a legal-document serif), Inter for all UI text and body copy (legible, neutral, fast to scan).
- **Components:** sharp-ish corners (4–6px radius, not the very rounded style common in consumer apps), generous whitespace, clear dividing lines rather than heavy card shadows — reads like a well-typeset document, not a dashboard full of widgets.
- **The Decision Record itself** is treated as a distinct visual artifact everywhere it appears: bordered, left accent in the amber momentum color, with a visible timestamp and signature line — it should look like something you'd be comfortable screenshotting into a board deck.

## Information Architecture

```
/                        → marketing/landing (public)
/login                   → PM sign in
/app                     → dashboard (all projects, cross-project open decisions & overdue tasks)
/app/projects/:id        → Project Home (Unified Feed + tabs)
  ?tab=feed               → default: chronological combined feed
  ?tab=tasks              → task board (simple list grouped by status)
  ?tab=stakeholders        → stakeholder roster
  ?tab=decisions           → all decision requests/records for this project
/app/projects/:id/decisions/new   → create a Decision Request
/d/:token                → PUBLIC, no login: stakeholder view of a single Decision Request
/app/projects/:id/export → audit-trail export view (print/PDF-friendly)
```

## Core User Flows

### Flow A — PM creates and resolves a decision (the differentiator)
1. PM opens a project → Project Home → clicks "New Decision."
2. Fills in title, context, options (default: Approve / Reject / Needs changes), optional deadline, selects which stakeholder(s) it's addressed to.
3. Tasketra generates a unique link (`/d/:token`) and — if the stakeholder has an email on file — the PM can send it directly from the app (Section 3.3, Integrations).
4. Stakeholder opens the link on any device, no login: sees the title, context, and options in a clean, single-purpose page (nothing else in the app is visible or accessible from here).
5. Stakeholder selects a response and types their name, submits.
6. The Decision Record is created instantly: response, name, exact timestamp, and the original request are locked together and displayed as one artifact.
7. Project feed updates immediately; PM (and anyone else with access) sees it in context with everything else that happened that week.

### Flow B — Stakeholder view (public, zero-friction)
Deliberately the simplest screen in the whole product. No navigation, no sign-up prompt, no upsell. Just: what's being asked, the options, a name field, submit. This has to work perfectly on a phone for someone who has never seen Tasketra before and never will again.

### Flow C — PM's daily check-in
PM logs in → dashboard shows, across all projects: decisions awaiting a response (with how long they've been waiting), tasks overdue, and a condensed recent-activity feed. This is the "start here every morning" screen.

## Screen-by-Screen Notes

- **Dashboard:** three columns — Awaiting Decisions, Overdue Tasks, Recent Activity. Every item is one click from its full context.
- **Project Home / Feed:** a single vertical timeline, most recent first. Each entry is visually distinct by type (task change = neutral, status update = neutral with an icon, decision request = gold left-border, decision record = gold left-border, filled/bold once resolved).
- **Task board:** grouped by status column (Not Started / In Progress / Blocked / Done) — deliberately not a kanban-with-drag-and-drop for v1; simple status dropdown per task row. Function over flourish.
- **Stakeholder roster:** a simple table — name, role, email, and a count of open/resolved decisions tied to them, so a PM can see at a glance who's been responsive and who hasn't.
- **Export/audit view:** strips all app chrome, renders every Decision Record for the project in order, print-ready.
