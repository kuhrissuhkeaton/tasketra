# Tasketra runbook — deploy, rollback, restore

The operational procedures for app.tasketra.com. If you are reading this at
2 a.m. because something broke, go straight to **Rollback**.

Standing safety rule for every deploy: **code deploys do not touch the
database.** Any release that carries a database migration must be flagged
before deploy, and migrations are additive-only.

## Deploy (production)

Deploys run **only from the maintainer's Mac** (the repo checkout at
`~/Downloads/tasketra-repo`), in three blocks, one at a time, each on her
explicit go-ahead. Never bundle the blocks into one paste, and run each
terminal block **once** — a duplicated patch application can partially
reverse-apply.

**Block 1 — fetch and check the patch**

```sh
cd ~/Downloads/tasketra-repo
curl -L "<patch download URL>" -o <patch-file>
wc -c <patch-file>            # must match the byte count in the release notes
git apply --check <patch-file>   # silence means it applies cleanly
```

(Releases with binary files use `git apply`; older text-only releases used
`patch -p1`. The release notes say which.)

**Block 2 — apply, commit, push**

```sh
git apply <patch-file>
git add -A
git status --short            # eyeball the file list against the release notes
git commit -m "vNNN: <release summary>"
git push origin main
```

**Block 3 — deploy**

```sh
netlify status                # MUST name charter-pm-karissa2026 and
                              # https://app.tasketra.com — see below
unset NETLIFY_SITE_ID
netlify deploy --prod
```

The `netlify status` check is not ceremony: on 2026-10-09 an app deploy went
to the marketing site's project because the folder was linked to the wrong
project. If status names anything else, stop and fix the link first:

```sh
netlify unlink
netlify link --id 9f780a23-ee8d-4fee-b96f-dcace24db7ea
netlify status                # confirm before deploying
```

**After the deploy**

- Confirm the live bundle changed:
  `curl -s https://app.tasketra.com/ | grep -o 'assets/[^"]*'`
  and compare the bundle filename against the deploy output.
- Run the post-deploy spot-check against the live app on the beta test
  account: the surfaces the release touched, plus a visual spacing/formatting
  pass (not just "does it work"). Only then is the release verified.

## Rollback

A rollback republishes an earlier deploy. It restores **code only** — it does
not undo database migrations or data writes.

1. Open the Netlify dashboard → project `charter-pm-karissa2026` → Deploys.
2. Find the last known-good deploy and choose **Publish deploy**.
3. Verify the live bundle changed (same curl check as above) and spot-check
   the app.

### The migration guard — read this before republishing anything

Once a migration in `netlify/database/migrations/` has been applied to the
production database, **Netlify refuses to publish any deploy that does not
contain that migration file** — including rollback republishes of older
deploys. The error reads like "migration … has been removed after being
applied".

Recovery, learned 2026-11-02:

1. Recreate the migration file in `netlify/database/migrations/` with the
   **same version_name** as the applied one.
2. Deploy fresh from the repo (`netlify deploy --prod`) instead of
   republishing the old deploy.

### When rollback is safe, and when it is a decision

- **Safe as a reflex:** the bad release was code-only (no migration, no data
  writes). Republish the previous deploy.
- **A decision, not a reflex:** the bad release included a migration or wrote
  data in a new shape. Old code against a migrated database can misread or
  corrupt the new data. Stop, assess what the migration changed, and choose
  deliberately: roll forward with a fix, or pair the code rollback with a
  data plan. Additive-only migrations are the standing rule precisely so old
  code can usually keep running against the new schema — but "usually" is a
  thing to verify, not assume.

## Restore from B2 backup

**Status: procedure written and pre-rehearsed on synthetic data (Gate 0,
Step 1 Foundation Plan §1.7). The attended rehearsal against a real backup
run — which signs this entry — is recorded in the rehearsal log at the
bottom of this section. Until that entry exists, treat a real restore as
unproven and say so.**

What the backup is: `scheduled-backup.mts` runs **weekly** (Mondays 06:00
UTC, last 12 runs kept) and writes one run per week to Backblaze B2 under
`backups/<runId>/`: `manifest.json` (export timestamp, per-table row counts,
document count, avatar count), `db.json` (every table's rows), `documents/`
(every file in the Netlify Blobs documents store), and `avatars/` (every
file in the avatars store — runs from before the Gate 0 fix, 2026-11-28,
have no `avatars/` folder and no avatar count; they restore validly, just
without avatars). Netlify Database's own built-in backups are a separate
mechanism and are **not** what this procedure restores.

**Exclusions, by design:** `rate_limit_hits` (ephemeral abuse counters) and
`password_reset_tokens` (short-lived security tokens — restoring one would
let an expired reset link work again) are not exported. After a restore both
tables are empty, which is correct.

**The restore tool** is `scripts/restore-backup.mjs`, kept in this repo. It
rebuilds the schema from all migrations in order, imports `db.json` in
FK-safe order, copies the document and avatar files to a local directory,
and then runs the verification battery. Its output is counts and pass/fail
only — never row contents.

### Safety rules (plan §6, SR-7 — conditions, not aspirations)

- The importer **refuses a non-empty target database**. A restore only ever
  runs into an empty, isolated scratch database — never production, never
  over live data.
- The scratch copy is attended by the maintainer, is never on a public URL,
  and is never used for demos, screenshots, or browsing real projects.
- If the app is booted against the scratch database for the load checks,
  its auth uses a **throwaway `SESSION_SECRET`** so restored password
  hashes and session material cannot be exercised.
- Results are reported as counts and pass/fail only — never data samples,
  in any log, message, or report.
- The scratch copy is **destroyed at the end of the same session** and the
  destruction is confirmed in the rehearsal log below.
- A rehearsal never becomes a member-facing restore promise: backups are
  disaster recovery, not an undo service (SR-7.4).

### Procedure

0. **Confirm the target's Postgres major version matches production's**
   before creating the scratch database. (Production's major version is not
   recorded in the repo; read it from the Netlify Database dashboard or
   `SHOW server_version` against production, and write it into the
   rehearsal log. The synthetic pre-rehearsal ran on PostgreSQL 16.)
1. **Download the chosen run** from B2 (`backups/<runId>/`) into a local
   directory: `manifest.json`, `db.json`, `documents/`, and `avatars/` if
   the run has them. Note the run's timestamp — the backup's age goes in
   the log (the weekly cadence means the newest run can be ~7 days old).
2. **Create an empty scratch database** (local Postgres or a fresh Netlify
   Database — the target must be empty; the importer checks and refuses
   otherwise). No public URL.
3. **Run the importer**, timed:
   `node scripts/restore-backup.mjs --source <run-dir> --target <scratch-connection-string> --files-out <dir>`
   It pre-flights the backup (manifest and `db.json` must agree), rebuilds
   the schema from all migrations, loads the rows, copies the files out,
   and runs the battery. Five tables cannot be strictly FK-ordered: one
   genuine reference cycle (`projects` → `decision_requests` →
   `stakeholders` → `projects`, via `charter_decision_id`,
   `owner_stakeholder_id`, and `project_id`) plus the self-referencing
   `users` (`referred_by`) and `tasks` (`parent_task_id`). Those five load
   with FK checks deferred to the battery's integrity sweep, the same
   mechanism `pg_restore --disable-triggers` uses. Every other table loads
   with FK checks fully on, parents before children.
4. **The battery decides — any single failure fails the restore:**
   per-table row counts equal the manifest **exactly**; the FK integrity
   sweep finds zero orphan rows; document and avatar file counts equal the
   manifest with no empty files; the two excluded tables are present in the
   schema and empty.
5. **Spot checks, by the maintainer in the room, reported pass/fail only:**
   the admin account is present; the Portal, Summit, and Clinic projects
   are present with their known logged-cost total; one decision with a
   public token has its link intact; one subscription row is shaped
   correctly; one restored document actually opens.
6. **App-boots check:** point a local/dev build of the app at the scratch
   database with a throwaway `SESSION_SECRET` and confirm Today, one
   project, and Workload load.
7. **Record and destroy:** fill in the rehearsal log below (date, backup
   run timestamp and age, target used, measured duration, battery result,
   who ran it), then destroy the scratch database and the downloaded run
   copy in the same session and confirm the destruction in the log.
8. **After a real disaster restore** (not a rehearsal): the importer writes
   document/avatar files to a local directory; re-uploading them to the
   new site's Netlify Blobs stores (documents keyed by document id, avatars
   keyed by user id) is a separate manual step before the app can serve
   them.

### Measured durations

- Synthetic pre-rehearsal (2026-11-28, Ada): importer end-to-end **340 ms**
  against a fixture-scale backup (44 tables, 21 rows, 3 files) on a local
  PostgreSQL 16.15. This proves the path, not the production number — the
  attended rehearsal records the real one.
- Attended rehearsal: see the log below.

### Rehearsal log (signed entry — Gate 0 completes when this is filled)

- Date:
- Backup run restored (runId / exportedAt):
- Backup age at restore:
- Target used (Netlify DB / local Postgres, and its Postgres version):
- Production Postgres major version (and how it was confirmed):
- Importer duration (end to end):
- Battery result (pass/fail per section — counts, FK sweep, files):
- Spot checks (pass/fail only):
- App-boots check (Today / one project / Workload):
- Ran by / attended by:
- Scratch destroyed in the same session (confirmed by, how):

Backups are disaster recovery. They are **not** a member-facing undo service,
and no restore promise is made to members on the strength of them.

## Data changes in production

- **Netlify's built-in AI agent is not a SQL console.** Asking it to change
  production data made it apply the change as a formal migration and publish
  its own deploy, which broke /api/* routing site-wide (~13 min outage,
  2026-11-02). Data changes go through the Netlify/Neon dashboard SQL editor
  (owner access) or a reviewed migration file in the repo — never the agent.
- Both CLI connection strings are effectively read-only for the `users`
  table; production data writes need the dashboard SQL editor or the app's
  own functions.

## Known failure modes

- **The wrapper CLI's env commands lie.** `netlify env:get` / `env:list` have
  reported existing production variables as "no value set", and `env:set`
  has failed while the variable was in fact set correctly. Ground truth is
  the direct API: `GET https://api.netlify.com/api/v1/sites/<site_id>/env`
  with the stored auth token (values come back masked for secret-marked
  vars; keys and contexts are accurate). And remember: functions snapshot
  env vars at deploy time — redeploy after adding a variable.
- **Draft deploys have a broken auth backend.** A draft deploy runs against
  an isolated database branch and every login returns 500. Do not conclude a
  release is broken from a draft deploy's login failure; the working pattern
  is ship-then-verify-live with the previous deploy ready to republish as
  the rollback.
- **`netlify dev` on the Mac dies with EMFILE** while loading the 82
  functions; raising `ulimit -n` to 8192 was not enough. Local verification
  is the test suite + `tsc -b`, not `netlify dev`.
- **`restoreSiteDeploy` via the API returned 422** for a CLI-created deploy;
  the dashboard "Publish deploy" path is the reliable rollback route (subject
  to the migration guard above).
