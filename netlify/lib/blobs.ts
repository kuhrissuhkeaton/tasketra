import { getStore } from "@netlify/blobs";

// Single blob store for all uploaded project documents. Blobs are keyed by
// the document's own UUID (the documents.id column), never by user-supplied
// filename, so there's no path-traversal or collision surface from what
// someone names their file.
export function documentsStore() {
  return getStore("documents");
}

// One avatar per user, keyed directly by user id (unlike documents, there's
// no history to keep -- a new upload just overwrites the old blob). See
// avatar.mts: users.avatar_key stores the image's mime type as a presence
// flag (non-null = has an avatar) since the blob key itself is always just
// the user's own id, nothing extra to record there.
export function avatarsStore() {
  return getStore("avatars");
}
