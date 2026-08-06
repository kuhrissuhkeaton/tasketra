import { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "./env.ts";

// Backblaze B2 speaks the S3 API, so the AWS SDK's S3Client works against it
// unmodified once pointed at B2's endpoint -- no B2-specific SDK needed.
// Used exclusively by the scheduled off-site backup job; nothing else in the
// app touches this.

let client: S3Client | null = null;

export function backupBucketName(): string {
  const bucket = getEnv("B2_BUCKET_NAME");
  if (!bucket) throw new Error("B2_BUCKET_NAME is not configured.");
  return bucket;
}

export function s3(): S3Client {
  if (client) return client;
  const endpoint = getEnv("B2_ENDPOINT");
  const keyId = getEnv("B2_APPLICATION_KEY_ID");
  const secret = getEnv("B2_APPLICATION_KEY");
  if (!endpoint || !keyId || !secret) {
    throw new Error("B2 backup storage is not configured (B2_ENDPOINT/B2_APPLICATION_KEY_ID/B2_APPLICATION_KEY).");
  }
  // B2's S3-compatible endpoint is region-specific (e.g.
  // s3.us-east-005.backblazeb2.com) -- derive the AWS SDK's required
  // "region" field from it rather than hand-maintaining a second setting
  // that has to stay in sync with B2_ENDPOINT.
  const region = endpoint.split(".")[1] || "us-east-005";
  client = new S3Client({
    endpoint: `https://${endpoint}`,
    region,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
    // B2 (like most non-AWS S3-compatible providers) needs path-style
    // addressing -- the SDK's default virtual-hosted style constructs
    // "<bucket>.<endpoint>" which doesn't resolve correctly here.
    forcePathStyle: true,
  });
  return client;
}
