# Tasketra

Tasketra is project management software for independent and fractional project
managers, and the consultants and small teams who run client projects — real
project structure without enterprise bloat. One flat price per account
(14-day free Pro trial, then $29/month), no per-seat pricing.

- Live app: https://app.tasketra.com (Netlify project `charter-pm-karissa2026`)
- Marketing site: https://tasketra.com — a **different** repo (ProjectPMP) and a
  different Netlify project. Never deploy this repo there.

## Stack

- React 19 + TypeScript + Vite (app project: `tsconfig.app.json`, strict mode on)
- Netlify Functions (82 serverless functions in `netlify/functions/`, project:
  `tsconfig.functions.json`, strict mode on)
- Netlify Database (Postgres) for data, Netlify Blobs + Backblaze B2 for files
- Stripe for billing, Resend for email, Sentry for error reporting
- Tests: Vitest (component, smoke, and integration suites under `src/__tests__/`)

Architecture notes live in `docs/ARCHITECTURE.md`. Deploy, rollback, and
recovery procedures live in `docs/RUNBOOK.md` — read it before shipping.

## Local setup

```sh
npm ci --no-bin-links   # on some VMs plain `npm ci` fails with EPERM chown;
                        # --no-bin-links is the known-good install there
npm run dev             # Vite dev server
```

Note: `netlify dev` on the maintainer's Mac currently dies with an EMFILE
error while loading all 82 functions (see the runbook's known failure modes).
The working pattern is: verify locally with the test suite + `tsc -b`, deploy,
then run the verification pass against the live site.

## Environment variables

Names only — values live in the Netlify dashboard (site environment) and in
the maintainer's password manager, never in this repo. `.env` files are
gitignored; never commit one (this repo is public).

| Variable | Used for |
| --- | --- |
| `SESSION_SECRET` | Signing session cookies. Required — the app fails loudly without it. |
| `ADMIN_EMAIL` | The founder/admin account email. |
| `STRIPE_SECRET_KEY` | Stripe API (server). |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key served to the client. |
| `STRIPE_WEBHOOK_SECRET` | Verifying Stripe webhook signatures. |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` | Pro price IDs. |
| `RESEND_API_KEY` | Transactional email. |
| `B2_ENDPOINT` / `B2_BUCKET_NAME` / `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` | Backblaze B2 document storage. |
| `NETLIFY_DB_URL` / `NETLIFY_DB_DRIVER` | Provided by Netlify Database. |
| `FOUNDING_CAP` | Founding-member cap (optional; code default applies when unset). |
| `EMAIL_DNS_CHECK` | Optional toggle for the signup email DNS check. |
| `VITE_SENTRY_DSN` | Build-time Sentry DSN for the client bundle. |

Functions snapshot environment variables at deploy time: after adding or
changing a variable in the dashboard, redeploy before concluding it does not
work.

## Verifying a change (the manual gate — there is no CI)

Two checks, run **sequentially**, and both must pass before a release is
called verified:

```sh
node node_modules/typescript/bin/tsc -b   # NOT `tsc --noEmit`: the
                                          # production build runs `tsc -b`,
                                          # which enforces checks --noEmit
                                          # misses (e.g. noUnusedLocals)
npm test                                  # the FULL vitest suite
```

Rules that have bitten before, so they are written down:

- **Never run two vitest invocations concurrently.** The integration suites
  share local database setup; concurrent runs starve each other's hooks into
  timeouts that look like failures. Run targeted suites first, then one full
  sequential run.
- **Only the full run's final tally counts.** A subset run (e.g. only the
  unit tests) is not "all tests pass", and partial results that arrive while
  the full run is still going are not the result. The suite grows with each
  release, so always date the tally when you report it.
- **The api layer caches GET responses per URL in module memory**
  (`getCache` in `src/lib/api.ts`). Inside one test file, a later test that
  re-answers the same URL with a different fixture silently gets the FIRST
  test's cached response. A test that needs its own payload for an
  already-used URL must call `clearApiCache()` (exported from `src/lib/api`)
  first; component test files do this in `beforeEach`.

## Shipping

Deploys run **only from the maintainer's Mac**, one step at a time, each on
her go-ahead. The full procedure — the three-block deploy flow, the rollback
procedure with the migration guard, and the backup-restore entry — is in
`docs/RUNBOOK.md`.

Every user-facing release also gets a plain-language entry in
`src/lib/whatsNewData.ts` (newest first). Pure hotfixes and internal hygiene
releases (like R0) add no entry.
