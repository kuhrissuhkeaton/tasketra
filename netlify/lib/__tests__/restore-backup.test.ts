import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir, } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";

// Gate 0 / plan test T8: the backup importer (scripts/restore-backup.mjs)
// runs against a synthetic backup fixture, so every future change to the
// repo re-proves the importer still works — and a change to the export's
// shape fails a test instead of failing silently on the worst day.
//
// The fixture is built the way the real backup is built: a source database
// is migrated and seeded, then exported by the same live-catalog enumeration
// + SELECT * that scheduled-backup.mts performs, so db.json's value shapes
// (ISO timestamps, parsed JSONB, string numerics) are the exporter's real
// shapes, not hand-written approximations. Contents follow the Gate 0
// package's fixture list: every table present (most empty), the full FK
// depth (user → project → members/tasks → task links; a decision with a
// public token + record + recipient; a subscription; documents with their
// files; an avatar), the awkward rows (soft-deleted, NULLs, JSONB, unicode,
// timestamps), and the two designed-exclusion tables absent from the export.
//
// The rehearsal itself never runs on PGlite (plan §1.7 — the drill needs a
// real Postgres at production's major version). This suite test is the
// smoke alarm, not the fire drill; it uses the suite's disposable engine
// exactly as testDb.ts does.

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const MIGRATIONS_DIR = join(repoRoot, "netlify", "database", "migrations");
const IMPORTER = join(repoRoot, "scripts", "restore-backup.mjs");

const EXCLUDED_TABLES = new Set(["rate_limit_hits", "password_reset_tokens"]);
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

// Fixed synthetic ids — fixture data only, never real data (Marshall's
// no-real-data-in-fixtures check).
const IDS = {
  userAdmin: "11111111-1111-4111-8111-111111111111",
  userMember: "22222222-2222-4222-8222-222222222222",
  projectA: "33333333-3333-4333-8333-333333333333",
  projectB: "44444444-4444-4444-8444-444444444444",
  stakeholder: "55555555-5555-4555-8555-555555555555",
  stakeholderDeleted: "66666666-6666-4666-8666-666666666666",
  taskA: "77777777-7777-4777-8777-777777777777",
  taskB: "88888888-8888-4888-8888-888888888888",
  taskDeleted: "99999999-9999-4999-8999-999999999999",
  decision: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  document: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  documentDeleted: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const DOCUMENT_BYTES = Buffer.from("Fixture document — café plan, naïve résumé ✓\n", "utf-8");
const AVATAR_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x66, 0x69, 0x78, 0x74, 0x75, 0x72, 0x65]);

interface DisposablePg {
  url: string;
  close: () => Promise<void>;
}

async function findFreePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const p = address.port;
        srv.close(() => resolve(p));
      } else {
        srv.close(() => reject(new Error("could not find a free port")));
      }
    });
    srv.on("error", reject);
  });
}

/** A disposable Postgres with NO schema applied — the importer's target
 *  shape (it rebuilds the schema itself). */
async function startEmptyPg(): Promise<DisposablePg> {
  const db = new PGlite({ extensions: { pgcrypto } });
  const port = await findFreePort();
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
    close: async () => {
      await server.stop();
      await db.close();
    },
  };
}

async function runMigrations(pool: pg.Pool): Promise<void> {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    await pool.query(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf-8"));
  }
}

async function seedSource(pool: pg.Pool): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, avatar_key, created_at) VALUES
       ($1, 'fixture-admin@example.test', 'fixture-hash-not-a-real-password', 'Zoë Ñoño 🚀', 'image/png', '2026-01-15T10:30:00.123Z'),
       ($2, 'fixture-member@example.test', 'fixture-hash-not-a-real-password', 'Plain Member', NULL, '2026-02-01T09:00:00.000Z')`,
    [IDS.userAdmin, IDS.userMember]
  );
  await pool.query(
    `INSERT INTO projects (id, owner_id, name, description) VALUES
       ($1, $3, 'Fixture Project — Ünïcode', 'A synthetic project for the restore fixture'),
       ($2, $3, 'Fixture Project B', NULL)`,
    [IDS.projectA, IDS.projectB, IDS.userAdmin]
  );
  await pool.query(
    `INSERT INTO project_members (project_id, user_id, invited_email, status, joined_at) VALUES
       ($1, $2, 'fixture-member@example.test', 'active', '2026-02-02T09:00:00.000Z'),
       ($1, NULL, 'invited@example.test', 'invited', NULL)`,
    [IDS.projectA, IDS.userMember]
  );
  await pool.query(
    `INSERT INTO stakeholders (id, project_id, name, email, role, deleted_at) VALUES
       ($1, $3, 'Fixture Stakeholder', 'stakeholder@example.test', 'Sponsor', NULL),
       ($2, $3, 'Deleted Stakeholder', NULL, NULL, '2026-03-01T12:00:00.000Z')`,
    [IDS.stakeholder, IDS.stakeholderDeleted, IDS.projectA]
  );
  await pool.query(
    `INSERT INTO tasks (id, project_id, title, status, owner_name, due_date, stakeholder_id, deleted_at) VALUES
       ($1, $4, 'Fixture task — première', 'in_progress', 'Zoë Ñoño', '2026-12-04', $5, NULL),
       ($2, $4, 'Dependent fixture task', 'not_started', NULL, NULL, NULL, NULL),
       ($3, $4, 'Soft-deleted fixture task', 'done', NULL, NULL, NULL, '2026-03-02T12:00:00.000Z')`,
    [IDS.taskA, IDS.taskB, IDS.taskDeleted, IDS.projectA, IDS.stakeholder]
  );
  await pool.query(
    `INSERT INTO task_task_links (task_id, depends_on_task_id) VALUES ($1, $2)`,
    [IDS.taskB, IDS.taskA]
  );
  await pool.query(
    `INSERT INTO decision_requests (id, project_id, title, context, options, deadline, public_token, status) VALUES
       ($1, $2, 'Fixture decision', 'Synthetic context', $3::jsonb, '2026-12-20', 'fixture-public-token-0001', 'resolved')`,
    [IDS.decision, IDS.projectA, JSON.stringify(["Option A — café", "Option B"])]
  );
  await pool.query(
    `INSERT INTO decision_request_recipients (decision_request_id, stakeholder_id) VALUES ($1, $2)`,
    [IDS.decision, IDS.stakeholder]
  );
  await pool.query(
    `INSERT INTO decision_records (decision_request_id, chosen_option, responder_name) VALUES ($1, 'Option A — café', 'Fixture Stakeholder')`,
    [IDS.decision]
  );
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, billing_interval, current_period_end) VALUES
       ($1, 'cus_fixture', 'sub_fixture', 'active', NULL, '2027-01-01T00:00:00.000Z')`,
    [IDS.userAdmin]
  );
  await pool.query(
    `INSERT INTO documents (id, project_id, uploaded_by, filename, mime_type, size_bytes, blob_key, deleted_at) VALUES
       ($1, $3, $4, 'fixture-plan.txt', 'text/plain', $5, $6, NULL),
       ($2, $3, $4, 'fixture-deleted.txt', 'text/plain', $5, $7, '2026-03-03T12:00:00.000Z')`,
    [IDS.document, IDS.documentDeleted, IDS.projectA, IDS.userAdmin, DOCUMENT_BYTES.length, IDS.document, IDS.documentDeleted]
  );
  await pool.query(
    `INSERT INTO status_updates (project_id, body) VALUES ($1, 'Weekly sync — naïve café notes ✓')`,
    [IDS.projectA]
  );
}

interface Fixture {
  dir: string;
  manifest: { exportedAt: string; tableCounts: Record<string, number>; documentCount: number; avatarCount?: number };
}

/** Exports the seeded source exactly the way scheduled-backup.mts does:
 *  live catalog enumeration, SELECT * per table, manifest from counts. */
async function buildFixture(sourceUrl: string, withAvatars: boolean): Promise<Fixture> {
  const pool = new pg.Pool({ connectionString: sourceUrl });
  try {
    const tableRows = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tables: Record<string, unknown[]> = {};
    for (const { table_name } of tableRows.rows) {
      if (EXCLUDED_TABLES.has(table_name)) continue;
      if (!TABLE_NAME_PATTERN.test(table_name)) continue;
      const result = await pool.query(`SELECT * FROM "${table_name}"`);
      tables[table_name] = result.rows;
    }

    const dir = mkdtempSync(join(tmpdir(), "tasketra-fixture-backup-"));
    mkdirSync(join(dir, "documents"), { recursive: true });
    writeFileSync(join(dir, "documents", IDS.document), DOCUMENT_BYTES);
    writeFileSync(join(dir, "documents", IDS.documentDeleted), DOCUMENT_BYTES);

    const manifest: Fixture["manifest"] = {
      exportedAt: new Date().toISOString(),
      tableCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      documentCount: 2,
    };
    if (withAvatars) {
      mkdirSync(join(dir, "avatars"), { recursive: true });
      // Avatars are keyed by user id (netlify/lib/blobs.ts).
      writeFileSync(join(dir, "avatars", IDS.userAdmin), AVATAR_BYTES);
      manifest.avatarCount = 1;
    }
    writeFileSync(join(dir, "db.json"), JSON.stringify(tables));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { dir, manifest };
  } finally {
    await pool.end();
  }
}

interface ImporterRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runImporter(sourceDir: string, targetUrl: string, filesOut: string): Promise<ImporterRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [IMPORTER, "--source", sourceDir, "--target", targetUrl, "--files-out", filesOut],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("Gate 0 — backup importer against a synthetic fixture (plan T8)", () => {
  let source: DisposablePg;
  let fixture: Fixture;
  let legacyFixture: Fixture;

  beforeAll(async () => {
    source = await startEmptyPg();
    const pool = new pg.Pool({ connectionString: source.url });
    try {
      await runMigrations(pool);
      await seedSource(pool);
    } finally {
      await pool.end();
    }
    fixture = await buildFixture(source.url, true);
    legacyFixture = await buildFixture(source.url, false);
  }, 300_000);

  afterAll(async () => {
    await source?.close();
  });

  it("restores the fixture and passes the battery, spot records intact", async () => {
    const target = await startEmptyPg();
    const filesOut = mkdtempSync(join(tmpdir(), "tasketra-restored-files-"));
    try {
      const run = await runImporter(fixture.dir, target.url, filesOut);
      expect(run.code, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("BATTERY: PASS");

      const pool = new pg.Pool({ connectionString: target.url });
      try {
        // Counts equal the manifest exactly, for every exported table.
        for (const [table, expected] of Object.entries(fixture.manifest.tableCounts)) {
          const res = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
          expect(res.rows[0].n, table).toBe(expected);
        }
        // The designed exclusions exist (schema rebuilt) and are empty.
        for (const table of EXCLUDED_TABLES) {
          const res = await pool.query(`SELECT count(*)::int AS n FROM "${table}"`);
          expect(res.rows[0].n, table).toBe(0);
        }
        // Spot records: unicode survives the round trip byte-for-byte.
        const user = await pool.query(`SELECT display_name, avatar_key, created_at FROM users WHERE id = $1`, [IDS.userAdmin]);
        expect(user.rows[0].display_name).toBe("Zoë Ñoño 🚀");
        expect(user.rows[0].avatar_key).toBe("image/png");
        expect(new Date(user.rows[0].created_at).getTime()).toBe(Date.parse("2026-01-15T10:30:00.123Z"));
        // JSONB lands back as JSON, not text.
        const decision = await pool.query(`SELECT options, public_token FROM decision_requests WHERE id = $1`, [IDS.decision]);
        expect(decision.rows[0].options).toEqual(["Option A — café", "Option B"]);
        expect(decision.rows[0].public_token).toBe("fixture-public-token-0001");
        // Soft-deleted rows restore as soft-deleted rows.
        const deletedTask = await pool.query(`SELECT deleted_at FROM tasks WHERE id = $1`, [IDS.taskDeleted]);
        expect(deletedTask.rows[0].deleted_at).not.toBeNull();
        // FK depth landed: the dependency link points at a real task.
        const link = await pool.query(
          `SELECT count(*)::int AS n FROM task_task_links l JOIN tasks t ON t.id = l.depends_on_task_id WHERE l.task_id = $1`,
          [IDS.taskB]
        );
        expect(link.rows[0].n).toBe(1);
        // NULLs stay NULL.
        const projectB = await pool.query(`SELECT description FROM projects WHERE id = $1`, [IDS.projectB]);
        expect(projectB.rows[0].description).toBeNull();
      } finally {
        await pool.end();
      }

      // Files restored: both documents, byte-identical; the avatar too.
      expect(readdirSync(join(filesOut, "documents")).sort()).toEqual([IDS.document, IDS.documentDeleted].sort());
      expect(readFileSync(join(filesOut, "documents", IDS.document)).equals(DOCUMENT_BYTES)).toBe(true);
      expect(readFileSync(join(filesOut, "avatars", IDS.userAdmin)).equals(AVATAR_BYTES)).toBe(true);
    } finally {
      await target.close();
    }
  }, 300_000);

  it("restores a pre-avatar-fix run (no avatarCount, no avatars folder)", async () => {
    const target = await startEmptyPg();
    const filesOut = mkdtempSync(join(tmpdir(), "tasketra-restored-files-"));
    try {
      const run = await runImporter(legacyFixture.dir, target.url, filesOut);
      expect(run.code, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("BATTERY: PASS");
      expect(run.stdout).toContain("not in this run");
      expect(existsSync(join(filesOut, "documents", IDS.document))).toBe(true);
    } finally {
      await target.close();
    }
  }, 300_000);

  it("fails the battery when the manifest lies about a count", async () => {
    // A manifest count edited after export: the battery must catch it and
    // fail — a rehearsal that cannot fail proves nothing.
    const lyingDir = mkdtempSync(join(tmpdir(), "tasketra-lying-backup-"));
    const lyingManifest = {
      ...fixture.manifest,
      tableCounts: { ...fixture.manifest.tableCounts, users: fixture.manifest.tableCounts.users + 1 },
    };
    writeFileSync(join(lyingDir, "manifest.json"), JSON.stringify(lyingManifest, null, 2));
    writeFileSync(join(lyingDir, "db.json"), readFileSync(join(fixture.dir, "db.json")));
    mkdirSync(join(lyingDir, "documents"), { recursive: true });
    writeFileSync(join(lyingDir, "documents", IDS.document), DOCUMENT_BYTES);
    writeFileSync(join(lyingDir, "documents", IDS.documentDeleted), DOCUMENT_BYTES);
    mkdirSync(join(lyingDir, "avatars"), { recursive: true });
    writeFileSync(join(lyingDir, "avatars", IDS.userAdmin), AVATAR_BYTES);

    const target = await startEmptyPg();
    const filesOut = mkdtempSync(join(tmpdir(), "tasketra-restored-files-"));
    try {
      const run = await runImporter(lyingDir, target.url, filesOut);
      expect(run.code).not.toBe(0);
      expect(run.stdout + run.stderr).toContain("FAIL");
      expect(run.stdout).not.toContain("BATTERY: PASS");
    } finally {
      await target.close();
    }
  }, 300_000);

  it("refuses to run against a non-empty target", async () => {
    const target = await startEmptyPg();
    const filesOut = mkdtempSync(join(tmpdir(), "tasketra-restored-files-"));
    try {
      const first = await runImporter(fixture.dir, target.url, filesOut);
      expect(first.code, first.stdout + first.stderr).toBe(0);

      const second = await runImporter(fixture.dir, target.url, filesOut);
      expect(second.code).toBe(2);
      expect(second.stdout + second.stderr).toContain("not empty");

      // The refused run changed nothing.
      const pool = new pg.Pool({ connectionString: target.url });
      try {
        const res = await pool.query(`SELECT count(*)::int AS n FROM users`);
        expect(res.rows[0].n).toBe(fixture.manifest.tableCounts.users);
      } finally {
        await pool.end();
      }
    } finally {
      await target.close();
    }
  }, 300_000);
});
