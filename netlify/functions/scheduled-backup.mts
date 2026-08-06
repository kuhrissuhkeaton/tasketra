import type { Config } from "@netlify/functions";
import { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../lib/db.ts";
import { documentsStore } from "../lib/blobs.ts";
import { s3, backupBucketName } from "../lib/s3.ts";
import { sendEmail } from "../lib/notify.ts";
import { getEnv } from "../lib/env.ts";
import { withSentry } from "../lib/sentry.ts";

// Weekly off-site backup: every table in the database plus every uploaded
// document, exported to a Backblaze B2 bucket outside Netlify entirely --
// so a Netlify-side incident can't take out the app and its backups at the
// same time. This supplements (doesn't replace) Netlify Database's own
// built-in backups, which only cover the database, not Blobs, and only for
// as long as the current plan's retention window.
//
// Two tables are deliberately excluded: rate_limit_hits (ephemeral abuse
// counters, not real data) and password_reset_tokens (short-lived security
// tokens -- restoring an old one would let an expired reset link work again).
const EXCLUDED_TABLES = new Set(["rate_limit_hits", "password_reset_tokens"]);

// Keep the last 12 weekly runs (~3 months) before pruning older ones.
const RETENTION_RUNS = 12;

const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

async function exportDatabase(database: ReturnType<typeof db>) {
  const tableRows = await database.sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;

  const tables: Record<string, unknown[]> = {};
  for (const { table_name } of tableRows) {
    if (EXCLUDED_TABLES.has(table_name)) continue;
    // Defense in depth: table names here come from Postgres's own catalog,
    // not user input, but this is spliced into raw SQL below so it's
    // validated against a strict identifier pattern regardless.
    if (!TABLE_NAME_PATTERN.test(table_name)) continue;

    // database.pool is typed as a union of the pg.Pool and Neon serverless Pool
    // shapes (DatabaseConnection covers both possible drivers); this app always
    // runs the plain pg.Pool ("server") driver, so narrow the type here rather
    // than at every call site.
    const result = await (database.pool as import("pg").Pool).query(`SELECT * FROM "${table_name}"`);
    tables[table_name] = result.rows;
  }

  return tables;
}

async function exportDocuments() {
  const store = documentsStore();
  const { blobs } = await store.list();
  const files: { key: string; data: ArrayBuffer }[] = [];
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "arrayBuffer" });
    if (data) files.push({ key: blob.key, data });
  }
  return files;
}

async function pruneOldRuns(client: ReturnType<typeof s3>, bucket: string) {
  const listed = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/", Delimiter: "/" })
  );
  const runPrefixes = (listed.CommonPrefixes || [])
    .map((p) => p.Prefix)
    .filter((p): p is string => !!p)
    .sort(); // ISO timestamps in the prefix sort chronologically as strings

  const toDelete = runPrefixes.slice(0, Math.max(0, runPrefixes.length - RETENTION_RUNS));
  for (const prefix of toDelete) {
    const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
    for (const obj of objects.Contents || []) {
      if (obj.Key) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
    }
  }
  return toDelete.length;
}

export default withSentry(async () => {
  const startedAt = new Date();
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const prefix = `backups/${runId}/`;

  try {
    const database = db();
    const client = s3();
    const bucket = backupBucketName();

    const tables = await exportDatabase(database);
    const documents = await exportDocuments();

    const manifest = {
      exportedAt: startedAt.toISOString(),
      tableCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      documentCount: documents.length,
    };

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}manifest.json`,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      })
    );
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}db.json`,
        Body: JSON.stringify(tables),
        ContentType: "application/json",
      })
    );
    for (const file of documents) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${prefix}documents/${file.key}`,
          Body: new Uint8Array(file.data),
        })
      );
    }

    const prunedCount = await pruneOldRuns(client, bucket);

    console.log(`[scheduled-backup] success runId=${runId} tables=${Object.keys(tables).length} documents=${documents.length} prunedRuns=${prunedCount}`);

    return new Response(
      JSON.stringify({ ok: true, runId, manifest, prunedRuns: prunedCount }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scheduled-backup] FAILED runId=${runId}:`, err);
    const alertTo = getEnv("BACKUP_ALERT_EMAIL") || getEnv("ADMIN_EMAIL");
    if (alertTo) {
      await sendEmail(
        alertTo,
        "Tasketra backup failed",
        `The scheduled off-site backup run (${runId}) failed with:\n\n${message}\n\nNothing was deleted or overwritten -- this only means the new backup wasn't created. Worth checking B2 credentials and the Netlify function logs.`
      ).catch(() => {});
    }
    // Non-2xx so this shows up as a failed run in Netlify's function logs too.
    return new Response(JSON.stringify({ ok: false, runId, error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

export const config: Config = { schedule: "0 6 * * 1" };
