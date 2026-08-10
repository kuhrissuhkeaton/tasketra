import type { Config } from "@netlify/functions";
import { db } from "../lib/db.ts";
import { getUserIdFromRequest } from "../lib/auth.ts";
import { json } from "../lib/http.ts";
import { avatarsStore } from "../lib/blobs.ts";
import { withSentry } from "../lib/sentry.ts";

// One avatar per user. Uploads always replace whatever was there (no
// history, unlike documents). Any authenticated user can view any other
// user's avatar via ?userId= -- avatars aren't private, they show up
// wherever a name does (project member lists, etc).

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export default withSentry(async (req: Request) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return json({ error: "Not authenticated" }, { status: 401 });
  const database = db();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const targetUserId = url.searchParams.get("userId");
    if (!targetUserId) return json({ error: "userId required" }, { status: 400 });

    const [user] = await database.sql`SELECT avatar_key FROM users WHERE id = ${targetUserId}`;
    if (!user?.avatar_key) return json({ error: "No avatar" }, { status: 404 });

    const store = avatarsStore();
    const blob = await store.get(targetUserId, { type: "arrayBuffer" });
    if (!blob) return json({ error: "No avatar" }, { status: 404 });

    return new Response(blob, {
      status: 200,
      headers: {
        "content-type": user.avatar_key,
        "cache-control": "private, max-age=300",
      },
    });
  }

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ error: "Expected multipart/form-data upload." }, { status: 400 });
    }
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: "Couldn't read upload." }, { status: 400 });

    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "file is required." }, { status: 400 });

    const ext = extOf(file.name);
    const mime = ALLOWED_TYPES[ext];
    if (!mime) return json({ error: "Use a JPG, PNG, or WEBP image." }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES) return json({ error: "Images are limited to 2MB." }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const store = avatarsStore();
    await store.set(userId, bytes);
    await database.sql`UPDATE users SET avatar_key = ${mime} WHERE id = ${userId}`;

    return json({ ok: true });
  }

  if (req.method === "DELETE") {
    const store = avatarsStore();
    await store.delete(userId).catch(() => {});
    await database.sql`UPDATE users SET avatar_key = NULL WHERE id = ${userId}`;
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
});

export const config: Config = { path: "/api/avatar" };
