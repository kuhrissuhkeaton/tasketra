import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { hasProjectAccess } from "../lib/ownership.ts";
import { json } from "../lib/http.ts";
import { logActivity } from "../lib/activity.ts";
import { documentsStore } from "../lib/blobs.ts";
import { withSentry } from "../lib/sentry.ts";
import { canUploadBytes, getUserPlan, isPaidPlan, storageCapBytes, storageUsedBytes } from "../lib/billing.ts";

// Project documentation uploads (specs, contracts, reference PDFs/images).
// Scoped to a fixed allow-list of common office/document/image types, capped
// at 5MB -- comfortably under Netlify's ~6MB buffered function payload limit
// (base64 JSON would eat ~30% of that in encoding overhead, so uploads use
// multipart/form-data instead to spend the full budget on real file bytes).
// No versioning: uploading a new file always creates a new document; to
// "replace" a doc, delete the old one and upload the new one.

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, { mime: string; previewable: boolean }> = {
  pdf: { mime: "application/pdf", previewable: true },
  doc: { mime: "application/msword", previewable: false },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", previewable: false },
  xls: { mime: "application/vnd.ms-excel", previewable: false },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", previewable: false },
  jpg: { mime: "image/jpeg", previewable: true },
  jpeg: { mime: "image/jpeg", previewable: true },
  png: { mime: "image/png", previewable: true },
  gif: { mime: "image/gif", previewable: true },
  webp: { mime: "image/webp", previewable: true },
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

// Keeps the display name but strips anything that isn't safe to render or
// use in a Content-Disposition header -- no path separators, no control
// characters. The blob itself is always keyed by document id, never by this.
function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() || "file";
  return base.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "file";
}

function fmtGB(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb % 1 === 0 ? gb : gb.toFixed(1)}GB`;
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const downloadId = url.searchParams.get("id");
    if (downloadId) {
      const [doc] = await database.sql`
        SELECT id, project_id, filename, mime_type, size_bytes, blob_key
        FROM documents WHERE id = ${downloadId} AND deleted_at IS NULL
      `;
      if (!doc || !(await hasProjectAccess(userId, doc.project_id))) {
        return json({ error: "Not found" }, { status: 404 });
      }
      const store = documentsStore();
      const blob = await store.get(doc.blob_key, { type: "arrayBuffer" });
      if (!blob) return json({ error: "File data missing" }, { status: 404 });

      const ext = extOf(doc.filename);
      const previewable = ALLOWED_TYPES[ext]?.previewable ?? false;
      const disposition = previewable ? "inline" : "attachment";
      return new Response(blob, {
        status: 200,
        headers: {
          "content-type": doc.mime_type,
          "content-disposition": `${disposition}; filename="${sanitizeFilename(doc.filename)}"`,
          "content-length": String(doc.size_bytes),
          "cache-control": "private, max-age=0, must-revalidate",
        },
      });
    }

    const projectId = url.searchParams.get("projectId");
    if (!projectId) return json({ error: "projectId required" }, { status: 400 });
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const rows = await database.sql`
      SELECT d.id, d.filename, d.mime_type, d.size_bytes, d.created_at, u.email AS uploaded_by_email
      FROM documents d
      JOIN users u ON u.id = d.uploaded_by
      WHERE d.project_id = ${projectId} AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `;
    const documents = rows.map((r: any) => ({
      ...r,
      previewable: ALLOWED_TYPES[extOf(r.filename)]?.previewable ?? false,
    }));

    // Storage usage is scoped to the project owner's account (the paying
    // party), not the viewer -- every member of the project sees the same
    // shared number, since they're all drawing against the owner's cap.
    const [project] = await database.sql`SELECT owner_id FROM projects WHERE id = ${projectId}`;
    const plan = await getUserPlan(database, project.owner_id);
    const storage = {
      usedBytes: await storageUsedBytes(database, project.owner_id),
      capBytes: storageCapBytes(plan),
    };
    return json({ documents, storage });
  }

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ error: "Expected multipart/form-data upload." }, { status: 400 });
    }
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: "Couldn't read upload." }, { status: 400 });

    const projectId = String(form.get("projectId") || "");
    const file = form.get("file");
    if (!projectId || !(file instanceof File)) {
      return json({ error: "projectId and file are required." }, { status: 400 });
    }
    if (!(await hasProjectAccess(userId, projectId))) return json({ error: "Not found" }, { status: 404 });

    const ext = extOf(file.name);
    const allowed = ALLOWED_TYPES[ext];
    if (!allowed) {
      return json(
        { error: "That file type isn't supported. Allowed: PDF, Word, Excel, and common image files." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return json({ error: "Files are limited to 5MB." }, { status: 400 });
    }

    const [project] = await database.sql`SELECT owner_id FROM projects WHERE id = ${projectId}`;
    const { ok, capBytes, plan } = await canUploadBytes(database, project.owner_id, file.size);
    if (!ok) {
      return json(
        {
          error: `Storage limit reached (${fmtGB(capBytes)} used across your projects). ${
            isPaidPlan(plan) ? "Delete some files to free up room." : "Upgrade to Pro for more room, or delete some files."
          }`,
          upgradeRequired: !isPaidPlan(plan),
        },
        { status: 402 }
      );
    }

    const bytes = await file.arrayBuffer();
    const filename = sanitizeFilename(file.name);

    // Blob key = document id, generated up front so the blob write and the
    // DB row share one id. Blob is written first: if that fails, nothing is
    // left behind; if the DB insert fails after, it's an orphaned blob
    // rather than a DB row pointing at nothing.
    const docId = crypto.randomUUID();
    const store = documentsStore();
    await store.set(docId, bytes);

    try {
      const [doc] = await database.sql`
        INSERT INTO documents (id, project_id, uploaded_by, filename, mime_type, size_bytes, blob_key)
        VALUES (${docId}, ${projectId}, ${userId}, ${filename}, ${allowed.mime}, ${file.size}, ${docId})
        RETURNING id, filename, mime_type, size_bytes, created_at
      `;
      await logActivity(database, {
        projectId, entityType: "document", entityId: doc.id, entityTitle: doc.filename, action: "created",
      });
      return json({ document: { ...doc, previewable: allowed.previewable } }, { status: 201 });
    } catch (err) {
      await store.delete(docId).catch(() => {});
      throw err;
    }
  }

  if (req.method === "PATCH") {
    const body = await req.json().catch(() => null) as any;
    const id = body?.id;
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, filename FROM documents WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }

    if (body.restore) {
      await database.sql`UPDATE documents SET deleted_at = NULL WHERE id = ${id}`;
      await logActivity(database, {
        projectId: existing.project_id, entityType: "document", entityId: id, entityTitle: existing.filename, action: "restored",
      });
      return json({ ok: true });
    }

    return json({ error: "Unsupported update." }, { status: 400 });
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "id required" }, { status: 400 });
    const [existing] = await database.sql`SELECT project_id, filename FROM documents WHERE id = ${id}`;
    if (!existing || !(await hasProjectAccess(userId, existing.project_id))) {
      return json({ error: "Not found" }, { status: 404 });
    }
    await database.sql`UPDATE documents SET deleted_at = now() WHERE id = ${id}`;
    await logActivity(database, {
      projectId: existing.project_id, entityType: "document", entityId: id, entityTitle: existing.filename, action: "deleted",
    });
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/documents" };
