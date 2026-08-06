import { getDatabase, type DatabaseConnection } from "@netlify/database";

// getDatabase() from @netlify/database does not cache -- every call opens a
// brand-new connection pool (a real TCP-connected pg.Pool when using the
// default "server" driver). Since 34 functions call db() and some call it
// more than once per invocation, that meant every request could open fresh,
// never-closed pools -- a real connection-leak risk under load, not just a
// test-harness inconvenience (caught while wiring up integration tests: the
// test database kept accumulating dangling connections between test files).
// Cache it the same way netlify/lib/s3.ts does.
let connection: DatabaseConnection | null = null;

export function db(): DatabaseConnection {
  if (connection) return connection;
  connection = getDatabase();
  return connection;
}

/** Test-only: forces the next db() call to open a fresh connection. Needed
 *  because each test file points NETLIFY_DB_URL at its own disposable
 *  database -- without this, a cached connection from an earlier test file
 *  would keep pointing at a database that's already been torn down. */
export function __resetDbCacheForTests(): void {
  connection = null;
}
