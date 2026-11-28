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

## Restore from backup

**Status: entry point only — the restore rehearsal has not yet been run.**

Backups exist (Netlify Database backups run daily and on every publish, plus
Backblaze B2 storage), and backup files are manifest-verified — but a restore
has never been rehearsed end to end, so today a restore is an unproven
procedure, not a capability anyone should promise against.

The tested restore rehearsal is **Gate 0** of the Step 1 Foundation Plan
(plan §1.7): build/verify the importer against synthetic data in an isolated
scratch environment with a throwaway `SESSION_SECRET`, attended by the
maintainer, results reported as counts and pass/fail only (never data
samples), scratch destroyed the same session. When Gate 0 has run, this
section gets the full entry: importer path, steps, exclusions, and the
measured restore duration, with the date last rehearsed.

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
