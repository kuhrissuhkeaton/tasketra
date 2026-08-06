import type { Config } from "@netlify/functions";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3, backupBucketName } from "../lib/s3.ts";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { getEnv } from "../lib/env.ts";
import { json } from "../lib/http.ts";
import { withSentry } from "../lib/sentry.ts";

// On-demand restore verification: fetches the most recent backup run from B2
// and checks that its contents are actually valid and restorable, not just
// "present". Meant to be hit manually after a backup run (or periodically)
// as a lightweight substitute for a full restore rehearsal -- it exercises
// the same read path a real restore would use: list -> get manifest ->
// get db.json -> get each document, then cross-checks counts.
//
// Gated the same way waitlist.mts is: if ADMIN_EMAIL is set, only that
// account can call this (it can reveal internal row counts and document
// keys, which is more than a random logged-in user should see).

async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = getEnv("ADMIN_EMAIL");
  if (!adminEmail) return true;
  const database = db();
  const [user] = await database.sql`SELECT email FROM users WHERE id = ${userId}`;
  return user?.email?.toLowerCase() === adminEmail.toLowerCase();
}

async function streamToBytes(body: unknown): Promise<Uint8Array> {
  // @ts-expect-error -- AWS SDK v3 body is a web ReadableStream in the Netlify Functions runtime.
  return body.transformToByteArray();
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  if (!(await isAdmin(userId))) return json({ error: "Not found" }, { status: 404 });

  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  try {
    const client = s3();
    const bucket = backupBucketName();

    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/", Delimiter: "/" })
    );
    const runPrefixes = (listed.CommonPrefixes || [])
      .map((p) => p.Prefix)
      .filter((p): p is string => !!p)
      .sort();
    const latest = runPrefixes[runPrefixes.length - 1];
    record("find latest run", !!latest, latest || "no run folders found under backups/");
    if (!latest) throw new Error("No backup runs found to verify.");

    const manifestRes = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: `${latest}manifest.json` })
    );
    const manifestBytes = await streamToBytes(manifestRes.Body);
    const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf-8")) as {
      exportedAt: string;
      tableCounts: Record<string, number>;
      documentCount: number;
    };
    record("manifest.json readable + valid JSON", true, `exportedAt=${manifest.exportedAt}`);

    const dbRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${latest}db.json` }));
    const dbBytes = await streamToBytes(dbRes.Body);
    const db_ = JSON.parse(Buffer.from(dbBytes).toString("utf-8")) as Record<string, unknown[]>;
    const dbTableNames = Object.keys(db_);
    const manifestTableNames = Object.keys(manifest.tableCounts);
    const tablesMatch =
      dbTableNames.length === manifestTableNames.length &&
      manifestTableNames.every((t) => Array.isArray(db_[t]) && db_[t].length === manifest.tableCounts[t]);
    record(
      "db.json table counts match manifest",
      tablesMatch,
      `${dbTableNames.length} tables in db.json, ${manifestTableNames.length} in manifest`
    );

    const docsListed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${latest}documents/` })
    );
    const docKeys = (docsListed.Contents || []).map((o) => o.Key).filter((k): k is string => !!k);
    record(
      "document count matches manifest",
      docKeys.length === manifest.documentCount,
      `${docKeys.length} objects found, manifest says ${manifest.documentCount}`
    );
    let docsOk = true;
    for (const key of docKeys) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await streamToBytes(res.Body);
      if (bytes.length <= 0) docsOk = false;
      record(`document restorable: ${key}`, bytes.length > 0, `${bytes.length} bytes`);
    }
    if (docKeys.length > 0) record("all documents downloaded with nonzero size", docsOk, "");

    const allOk = checks.every((c) => c.ok);
    console.log(`[verify-backup] ${allOk ? "PASSED" : "FAILED"} run=${latest} checks=${JSON.stringify(checks)}`);

    return json({ ok: allOk, run: latest, checks }, { status: allOk ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[verify-backup] FAILED: ${message}`);
    return json({ ok: false, error: message, checks }, { status: 500 });
  }
});

export const config: Config = { path: "/api/verify-backup" };
