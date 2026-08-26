# Tasketra — Architecture

## Stack

- **Frontend:** React + TypeScript, built with Vite, deployed as a static site.
- **Backend:** Netlify Functions (TypeScript, modern `.mts` handler format).
- **Database:** Netlify DB (managed Postgres, auto-provisioned via `@netlify/database`) — relational, since decisions/tasks/stakeholders are fundamentally relational data with clear foreign keys.
- **Auth:** custom, minimal — email + bcrypt-hashed password, signed session token in an httpOnly cookie. No third-party auth provider needed at single-user scale; keeps the whole stack inside Netlify with nothing external to configure.
- **Hosting:** Netlify (new, standalone project — separate from the existing projectpmp.com site, which predates the rebrand to Tasketra).

## Why this stack

Everything lives on one platform (Netlify) with no external services to wire up for the MVP — the database, functions, and static hosting are provisioned and deployed together. This keeps the "establish integrations" and "deploy live" phases simple and keeps the whole system inside infrastructure already in use.

## Data Model

```
users
  id            uuid pk
  email         text unique not null
  password_hash text not null
  created_at    timestamptz default now()

projects
  id          uuid pk
  owner_id    uuid fk -> users.id
  name        text not null
  description text
  archived    boolean default false
  created_at  timestamptz default now()

stakeholders
  id          uuid pk
  project_id  uuid fk -> projects.id
  name        text not null
  email       text
  role        text
  created_at  timestamptz default now()

tasks
  id           uuid pk
  project_id   uuid fk -> projects.id
  title        text not null
  status       text check in ('not_started','in_progress','blocked','done')
  owner_name   text
  due_date     date
  stakeholder_id uuid fk -> stakeholders.id, nullable
  created_at   timestamptz default now()
  updated_at   timestamptz default now()

decision_requests
  id            uuid pk
  project_id    uuid fk -> projects.id
  title         text not null
  context       text
  options       jsonb not null        -- e.g. ["Approve","Reject","Needs changes"]
  deadline      date
  public_token  text unique not null  -- random, unguessable — used in /d/:token
  status        text check in ('open','resolved') default 'open'
  created_at    timestamptz default now()

decision_request_recipients
  id                   uuid pk
  decision_request_id  uuid fk -> decision_requests.id
  stakeholder_id       uuid fk -> stakeholders.id

decision_records
  id                  uuid pk
  decision_request_id uuid fk -> decision_requests.id  (one-to-one once resolved)
  chosen_option       text not null
  responder_name      text not null
  responded_at        timestamptz default now()

status_updates
  id          uuid pk
  project_id  uuid fk -> projects.id
  body        text not null
  created_at  timestamptz default now()
```

The **Unified Feed** is a query, not a table: a `UNION ALL` across tasks (status changes), decision_requests/records, and status_updates for a project, ordered by timestamp — this is deliberate so the feed can never drift out of sync with the underlying data; it's always a live reflection of it.

## API (Netlify Functions)

All under `netlify/functions/`, each exporting `path` config so URLs are clean (no `/.netlify/functions/` prefix).

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
GET    /api/projects/:id/feed
POST   /api/projects/:id/stakeholders
GET    /api/projects/:id/stakeholders
POST   /api/projects/:id/tasks
PATCH  /api/tasks/:id
POST   /api/projects/:id/status-updates
POST   /api/projects/:id/decisions
GET    /api/projects/:id/decisions
GET    /api/decisions/public/:token      (no auth — powers /d/:token)
POST   /api/decisions/public/:token/respond   (no auth — records the Decision Record)
GET    /api/projects/:id/export
```

Auth-protected routes read the session cookie and verify it server-side on every call; the two `public` decision routes are intentionally the only unauthenticated write-capable surface in the system, and are scoped tightly (they can only act on the one decision request matching their unguessable token, and only while it's still `open`).

## Folder Structure

```
tasketra/
  netlify.toml
  package.json
  src/                       (React app)
    main.tsx
    App.tsx
    pages/
      Dashboard.tsx
      ProjectHome.tsx
      DecisionPublic.tsx
      Login.tsx
    components/
    lib/api.ts
  netlify/
    functions/
      auth-login.mts
      auth-logout.mts
      projects.mts
      project-detail.mts
      project-feed.mts
      stakeholders.mts
      tasks.mts
      status-updates.mts
      decisions.mts
      decisions-public.mts
      export.mts
    database/
      migrations/
        001_init/migration.sql
  docs/
    REQUIREMENTS.md
    PROJECT_PLAN.md
    UX_DESIGN.md
    ARCHITECTURE.md
```
