import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { __resetDbCacheForTests } from "../db.ts";

// A disposable, real Postgres for integration tests -- no Docker, no local
// Postgres install required. PGlite is a real Postgres engine (WASM), and
// pglite-socket exposes it over the actual Postgres wire protocol on a local
// TCP port, so @netlify/database's getDatabase() (which uses a plain
// pg.Pool under the hood when NETLIFY_DB_DRIVER isn't "serverless") can't
// tell it apart from a real server. Every test file that needs the DB should
// call setupTestDb() in beforeAll and teardownTestDb() in afterAll.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../database/migrations");

let db: PGlite | null = null;
let socketServer: PGLiteSocketServer | null = null;
let port: number | null = null;

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

function runMigrations(pool: pg.Pool) {
  const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return (async () => {
    for (const dir of dirs) {
      const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql");
      const sql = readFileSync(sqlPath, "utf-8");
      await pool.query(sql);
    }
  })();
}

/** Starts PGlite + a Postgres-wire-protocol socket in front of it, runs every
 *  real migration against it, and points NETLIFY_DB_URL at it so any code
 *  calling getDatabase() (via db() in netlify/lib/db.ts) transparently uses
 *  this instance for the duration of the test file. Safe to call once per
 *  test file in beforeAll(). */
export async function setupTestDb(): Promise<void> {
  db = new PGlite({ extensions: { pgcrypto } });
  port = await findFreePort();
  socketServer = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await socketServer.start();

  const connectionString = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const pool = new pg.Pool({ connectionString });
  await runMigrations(pool);
  await pool.end();

  process.env.NETLIFY_DB_URL = connectionString;
  delete process.env.NETLIFY_DB_DRIVER; // ensure the plain pg.Pool ("server") driver is used
  __resetDbCacheForTests(); // this test file's db() calls must use this connection, not a stale cached one
}

/** Stops the socket server and the embedded Postgres instance. Call once per
 *  test file in afterAll(). */
export async function teardownTestDb(): Promise<void> {
  // Close the cached connection's own pool cleanly before tearing down the
  // server it's connected to -- otherwise its idle client gets an abrupt
  // disconnect and pg emits an unhandled "Connection terminated" error.
  const { db: getDb } = await import("../db.ts");
  await getDb().pool.end().catch(() => {});
  __resetDbCacheForTests();

  await socketServer?.stop();
  await db?.close();
  db = null;
  socketServer = null;
  port = null;
  delete process.env.NETLIFY_DB_URL;
}

/** Wipes all application data between tests within a file, without re-running
 *  migrations. Keeps tests independent while staying fast. Call in
 *  beforeEach() for any test file where tests write data. */
export async function resetTestDb(): Promise<void> {
  if (!port) throw new Error("setupTestDb() must run before resetTestDb()");
  const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres` });
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const tables = rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(", ");
  if (tables) {
    await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  await pool.end();
}
