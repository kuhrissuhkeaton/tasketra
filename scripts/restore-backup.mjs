#!/usr/bin/env node
// restore-backup.mjs — the Tasketra backup restore tool (Step 1 Foundation
// Plan §1.7, Gate 0). The plan's words: "the script *is* the restore tool."
//
// What it does, in order:
//   1. Reads one backup run (manifest.json + db.json + documents/ [+ avatars/]
//      for runs made after the Gate 0 avatar fix) from a local directory —
//      e.g. a run downloaded from the Backblaze B2 `backups/<runId>/` prefix.
//   2. Pre-flight: checks the manifest and db.json agree with each other.
//      A backup whose own two halves disagree is not restored from.
//   3. Refuses to run against a target database that is not empty (the
//      safety interlock: a restore can never be pointed at a live database
//      and "restore" over real data).
//   4. Rebuilds the schema by applying every migration in
//      netlify/database/migrations/ in order — the schema is never part of
//      the export; it is rebuilt from the same history as production.
//   5. Imports db.json's rows in FK-safe order (parents before children,
//      computed from the restored schema's own foreign keys).
//   6. Copies the document (and avatar) files out to a local directory.
//   7. Runs the verification battery: per-table row counts equal the
//      manifest exactly, a foreign-key integrity sweep, and file counts.
//      Any single failure fails the restore.
//
// Output discipline (SR-7): table names, row counts, file counts, timings,
// PASS/FAIL — never row contents, never the target connection string.
//
// Usage:
//   node scripts/restore-backup.mjs --source <run-dir> --target <postgres-url> [--files-out <dir>]
//
//   --source     Directory holding manifest.json, db.json, documents/,
//                and (post-avatar-fix runs) avatars/.
//   --target     Connection string for an EMPTY Postgres database.
//   --files-out  Where document/avatar files are written
//                (default: ./restored-files). Files land in documents/ and
//                avatars/ subdirectories, keyed exactly as in the backup.
//
// Exit codes: 0 = battery PASS · 1 = pre-flight or battery FAIL ·
//             2 = refused (usage error, or target not empty) ·
//             3 = infrastructure error (connect / migration / load failure)
//
// Dependencies: Node 18+ and the repo's node_modules (`pg`, which the test
// harness in netlify/lib/__tests__/testDb.ts also imports directly).

import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(repoRoot, "netlify", "database", "migrations");

// The two tables the exporter leaves out on purpose (scheduled-backup.mts):
// ephemeral abuse counters, and short-lived reset tokens — restoring an old
// reset token would let an expired reset link work again. On restore both
// tables are simply empty, which is correct. They are the ONLY schema tables
// allowed to be absent from a backup's manifest.
const DESIGNED_EXCLUSIONS = new Set(["rate_limit_hits", "password_reset_tokens"]);

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function fail(code, message) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { source: null, target: null, filesOut: join(process.cwd(), "restored-files") };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--source") args.source = argv[++i];
    else if (flag === "--target") args.target = argv[++i];
    else if (flag === "--files-out") args.filesOut = argv[++i];
    else fail(2, `unknown argument: ${flag}`);
  }
  if (!args.source || !args.target) {
    fail(2, "usage: node scripts/restore-backup.mjs --source <run-dir> --target <postgres-url> [--files-out <dir>]");
  }
  return args;
}

function readJson(path, label) {
  if (!existsSync(path)) fail(1, `pre-flight FAIL: ${label} not found at ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    fail(1, `pre-flight FAIL: ${label} is not valid JSON`);
  }
}

// Convert one value from db.json back into something the pg driver should
// send for the target column. db.json was produced by JSON.stringify-ing the
// pg driver's own row objects, so: timestamps are ISO strings (Postgres
// casts them back), JSONB values are plain objects/arrays (re-stringified
// here, because a bare parameter is sent as text), numerics are strings
// (Postgres casts), booleans are booleans. Bytea would arrive as
// {type:"Buffer",data:[...]} — no bytea columns exist today; handled anyway
// so a future one fails soft instead of corrupting.
function convertValue(value, udtName) {
  if (value === null || value === undefined) return null;
  if (udtName === "json" || udtName === "jsonb") {
    return typeof value === "object" ? JSON.stringify(value) : value;
  }
  if (udtName === "bytea" && typeof value === "object" && value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const phase = (name, t0) => console.log(`[${name}] done in ${Date.now() - t0}ms`);

  // ---- Pre-flight: the backup's two halves must agree ---------------------
  let t0 = Date.now();
  const manifest = readJson(join(args.source, "manifest.json"), "manifest.json");
  const dbJson = readJson(join(args.source, "db.json"), "db.json");
  if (!manifest || typeof manifest !== "object" || typeof manifest.tableCounts !== "object" || manifest.tableCounts === null) {
    fail(1, "pre-flight FAIL: manifest.json has no tableCounts object");
  }
  if (typeof manifest.documentCount !== "number") {
    fail(1, "pre-flight FAIL: manifest.json has no numeric documentCount");
  }
  // Runs from before the Gate 0 avatar fix have no avatarCount and no
  // avatars/ folder. That is a valid, restorable shape — avatars are simply
  // absent from those runs, and the battery reports them as such.
  const hasAvatars = typeof manifest.avatarCount === "number";
  const manifestTables = Object.keys(manifest.tableCounts);
  const dbTables = Object.keys(dbJson);
  let preflightFailures = 0;
  for (const table of manifestTables) {
    if (!Array.isArray(dbJson[table])) {
      console.log(`PREFLIGHT FAIL: table ${table} is in the manifest but missing (or not an array) in db.json`);
      preflightFailures++;
    } else if (dbJson[table].length !== manifest.tableCounts[table]) {
      console.log(
        `PREFLIGHT FAIL: table ${table}: manifest says ${manifest.tableCounts[table]} rows, db.json holds ${dbJson[table].length}`
      );
      preflightFailures++;
    }
  }
  for (const table of dbTables) {
    if (!(table in manifest.tableCounts)) {
      console.log(`PREFLIGHT FAIL: table ${table} is in db.json but absent from the manifest`);
      preflightFailures++;
    }
  }
  if (preflightFailures > 0) {
    console.log(`BATTERY: FAIL (${preflightFailures} pre-flight check(s) failed — nothing was written)`);
    process.exit(1);
  }
  console.log(
    `Backup run: exportedAt=${manifest.exportedAt} tables=${manifestTables.length} documents=${manifest.documentCount} avatars=${hasAvatars ? manifest.avatarCount : "not in this run (pre-avatar-fix backup)"}`
  );
  phase("pre-flight", t0);

  // ---- Connect + interlock -------------------------------------------------
  const client = new pg.Client({ connectionString: args.target });
  try {
    await client.connect();
  } catch (err) {
    fail(3, `could not connect to the target database: ${err.message}`);
  }
  try {
    const identity = await client.query(
      `SELECT current_database() AS db, split_part(version(), ' ', 2) AS pg_version`
    );
    console.log(`Target: database "${identity.rows[0].db}", Postgres ${identity.rows[0].pg_version}`);
    // Deterministic date/timestamp casts for the load session: db.json's
    // timestamps are UTC ISO strings, and the exporting process ran in UTC.
    await client.query(`SET timezone = 'UTC'`);

    const existing = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    if (existing.rows.length > 0) {
      console.error(
        `ERROR: refusing to restore — the target database is not empty (${existing.rows.length} table(s) already present). ` +
          `A restore only ever runs into an empty database.`
      );
      process.exit(2);
    }

    // ---- Schema: every migration, in order --------------------------------
    t0 = Date.now();
    const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of migrationDirs) {
      const sql = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf-8");
      try {
        await client.query(sql);
      } catch (err) {
        fail(3, `migration ${dir} failed: ${err.message}`);
      }
    }
    console.log(`Schema rebuilt from ${migrationDirs.length} migrations`);
    phase("schema", t0);

    // ---- Column + FK metadata from the restored schema ---------------------
    const columnsRes = await client.query(
      `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = 'public'`
    );
    const columnsByTable = new Map();
    for (const row of columnsRes.rows) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Map());
      columnsByTable.get(row.table_name).set(row.column_name, row.udt_name);
    }

    const fkRes = await client.query(
      `SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
              ccu.table_name AS parent_table, ccu.column_name AS parent_column,
              tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
    );
    const fkEdges = fkRes.rows; // child -> parent

    // ---- FK-safe order: parents before children ------------------------------
    // Tables are grouped into strongly connected components of the FK graph
    // and the components are ordered topologically, so every table loads
    // after the tables it references. Almost every component is a single
    // table loaded with FK checks fully on. The exceptions — the components
    // that genuinely cannot be ordered — are:
    //   * a multi-table reference cycle (in this schema exactly one:
    //     projects → decision_requests → stakeholders → projects, via
    //     charter_decision_id, owner_stakeholder_id, and project_id), and
    //   * a table that references itself (tasks' hierarchy column), whose
    //     rows can reference each other in any order.
    // Only those tables are loaded with FK triggers held off inside the
    // load transaction — the same mechanism pg_restore uses
    // (--disable-triggers) — and the battery's FK sweep below is what
    // proves the result is consistent. If the target role cannot hold
    // triggers off, the load aborts loudly rather than improvising.
    const allTables = [...columnsByTable.keys()];
    const parentsOf = new Map(allTables.map((t) => [t, new Set()]));
    const selfReferencing = new Set();
    for (const edge of fkEdges) {
      if (edge.child_table === edge.parent_table) selfReferencing.add(edge.child_table);
      else parentsOf.get(edge.child_table)?.add(edge.parent_table);
    }
    // Tarjan's algorithm: strongly connected components of child → parents.
    const sccs = [];
    {
      const indexOf = new Map();
      const lowlink = new Map();
      const onStack = new Set();
      const stack = [];
      let nextIndex = 0;
      const strongConnect = (v) => {
        indexOf.set(v, nextIndex);
        lowlink.set(v, nextIndex);
        nextIndex++;
        stack.push(v);
        onStack.add(v);
        for (const w of parentsOf.get(v)) {
          if (!indexOf.has(w)) {
            strongConnect(w);
            lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
          } else if (onStack.has(w)) {
            lowlink.set(v, Math.min(lowlink.get(v), indexOf.get(w)));
          }
        }
        if (lowlink.get(v) === indexOf.get(v)) {
          const component = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            component.push(w);
          } while (w !== v);
          sccs.push(component);
        }
      };
      for (const table of allTables) if (!indexOf.has(table)) strongConnect(table);
    }
    const componentOf = new Map();
    sccs.forEach((component, i) => component.forEach((t) => componentOf.set(t, i)));
    const componentParents = sccs.map(() => new Set());
    for (const table of allTables) {
      for (const parent of parentsOf.get(table)) {
        const from = componentOf.get(table);
        const to = componentOf.get(parent);
        if (from !== to) componentParents[from].add(to);
      }
    }
    // Order components so parents come before children (Kahn on the
    // condensation DAG — it is a DAG by construction, so this terminates).
    const componentOrder = [];
    {
      const placedComponents = new Set();
      const remainingComponents = new Set(sccs.map((_, i) => i));
      while (remainingComponents.size > 0) {
        for (const i of [...remainingComponents]) {
          if ([...componentParents[i]].every((p) => placedComponents.has(p))) {
            componentOrder.push(i);
            placedComponents.add(i);
            remainingComponents.delete(i);
          }
        }
      }
    }
    const deferredTables = new Set();
    const loadPlan = []; // [{ table, deferred }] in load order
    for (const i of componentOrder) {
      const component = [...sccs[i]].sort();
      const deferred = component.length > 1 || component.some((t) => selfReferencing.has(t));
      for (const table of component) {
        if (deferred) deferredTables.add(table);
        loadPlan.push({ table, deferred });
      }
    }
    if (deferredTables.size > 0) {
      console.log(
        `NOTE: ${deferredTables.size} table(s) cannot be strictly FK-ordered (reference cycle or self-reference); ` +
          `they are loaded with FK checks deferred to the verification sweep: ${[...deferredTables].sort().join(", ")}`
      );
    }

    // ---- Load ----------------------------------------------------------------
    t0 = Date.now();
    await client.query("BEGIN");
    let replicaMode = false;
    try {
      for (const { table, deferred } of loadPlan) {
        const rows = dbJson[table];
        if (!rows) continue; // schema table with no export rows (the designed exclusions)
        if (rows.length === 0) {
          console.log(`LOAD ${table}: 0 rows`);
          continue;
        }
        if (deferred && !replicaMode) {
          await client.query(`SET LOCAL session_replication_role = 'replica'`);
          replicaMode = true;
        }
        if (!deferred && replicaMode) {
          await client.query(`SET LOCAL session_replication_role = 'origin'`);
          replicaMode = false;
        }
        const columnTypes = columnsByTable.get(table);
        const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => columnTypes.has(c));
        for (const col of columns) {
          if (!IDENTIFIER.test(col)) fail(3, `unsafe column name in db.json for table ${table}: ${col}`);
        }
        const BATCH = 200;
        for (let i = 0; i < rows.length; i += BATCH) {
          const batch = rows.slice(i, i + BATCH);
          const params = [];
          const tuples = batch.map((row) => {
            const placeholders = columns.map((col) => {
              params.push(convertValue(row[col] ?? null, columnTypes.get(col)));
              return `$${params.length}`;
            });
            return `(${placeholders.join(", ")})`;
          });
          await client.query(
            `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${tuples.join(", ")}`,
            params
          );
        }
        console.log(`LOAD ${table}: ${rows.length} rows`);
      }
      if (replicaMode) await client.query(`SET LOCAL session_replication_role = 'origin'`);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      fail(3, `data load failed and was rolled back (target holds schema only): ${err.message}`);
    }
    phase("load", t0);

    // ---- Files -----------------------------------------------------------------
    t0 = Date.now();
    const fileResults = [];
    const copyStore = (label, sourceDir, manifestCount) => {
      const outDir = join(args.filesOut, label);
      mkdirSync(outDir, { recursive: true });
      if (manifestCount === null) {
        fileResults.push({ label, status: "absent from this backup run", ok: true });
        console.log(`FILES ${label}: not present in this backup run — nothing to restore`);
        return;
      }
      if (!existsSync(sourceDir)) {
        fileResults.push({ label, status: `source folder missing but manifest counts ${manifestCount}`, ok: false });
        console.log(`FILES ${label}: FAIL — manifest counts ${manifestCount} but the folder is missing from the run`);
        return;
      }
      const keys = readdirSync(sourceDir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
      let emptyFiles = 0;
      for (const key of keys) {
        copyFileSync(join(sourceDir, key), join(outDir, key));
        if (statSync(join(outDir, key)).size <= 0) emptyFiles++;
      }
      const ok = keys.length === manifestCount && emptyFiles === 0;
      fileResults.push({ label, status: `${keys.length} files (manifest ${manifestCount}), ${emptyFiles} empty`, ok });
      console.log(`FILES ${label}: ${keys.length} copied, manifest says ${manifestCount}, ${emptyFiles} empty — ${ok ? "ok" : "FAIL"}`);
    };
    copyStore("documents", join(args.source, "documents"), manifest.documentCount);
    copyStore("avatars", join(args.source, "avatars"), hasAvatars ? manifest.avatarCount : null);
    phase("files", t0);

    // ---- Battery -----------------------------------------------------------------
    t0 = Date.now();
    let failures = 0;
    const check = (ok, line) => {
      console.log(`${ok ? "PASS" : "FAIL"} ${line}`);
      if (!ok) failures++;
    };

    // Row counts equal the manifest exactly — every table, no rounding.
    for (const table of manifestTables) {
      const res = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
      check(res.rows[0].n === manifest.tableCounts[table], `count ${table}: restored ${res.rows[0].n}, manifest ${manifest.tableCounts[table]}`);
    }
    // Schema tables the manifest does not name: only the two designed
    // exclusions may appear here, and they must be empty. Anything else is
    // export drift — the backup silently stopped covering a table.
    for (const table of allTables) {
      if (table in manifest.tableCounts) continue;
      const res = await client.query(`SELECT count(*)::int AS n FROM "${table}"`);
      if (DESIGNED_EXCLUSIONS.has(table)) {
        check(res.rows[0].n === 0, `excluded-by-design ${table}: empty as designed (${res.rows[0].n} rows)`);
      } else {
        check(false, `table ${table} exists in the schema but is absent from the backup manifest (restored ${res.rows[0].n} rows)`);
      }
    }

    // FK integrity sweep: for every foreign key, no child row may reference
    // a parent row that isn't there.
    const constraints = new Map();
    for (const edge of fkEdges) {
      if (!constraints.has(edge.constraint_name)) {
        constraints.set(edge.constraint_name, { child: edge.child_table, pairs: [] });
      }
      constraints.get(edge.constraint_name).pairs.push([edge.child_column, edge.parent_column]);
    }
    let fkViolations = 0;
    for (const [name, { child, pairs }] of constraints) {
      const parent = fkEdges.find((e) => e.constraint_name === name).parent_table;
      const notNull = pairs.map(([c]) => `c."${c}" IS NOT NULL`).join(" AND ");
      const match = pairs.map(([c, p]) => `p."${p}" = c."${c}"`).join(" AND ");
      const res = await client.query(
        `SELECT count(*)::int AS n FROM "${child}" c WHERE ${notNull} AND NOT EXISTS (SELECT 1 FROM "${parent}" p WHERE ${match})`
      );
      if (res.rows[0].n > 0) {
        fkViolations += res.rows[0].n;
        check(false, `fk ${name}: ${res.rows[0].n} orphan row(s) in ${child}`);
      }
    }
    check(fkViolations === 0, `fk integrity sweep: ${constraints.size} constraints checked, ${fkViolations} orphan rows`);

    // Files were counted and checked during the copy step.
    for (const result of fileResults) {
      check(result.ok, `files ${result.label}: ${result.status}`);
    }
    phase("battery", t0);

    const totalMs = Date.now() - startedAt;
    if (failures > 0) {
      console.log(`BATTERY: FAIL (${failures} check(s) failed) — restore duration ${totalMs}ms`);
      process.exit(1);
    }
    console.log(`BATTERY: PASS — restore duration ${totalMs}ms`);
    process.exit(0);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => fail(3, `unexpected error: ${err.message}`));
