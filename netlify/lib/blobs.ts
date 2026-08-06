import { getStore } from "@netlify/blobs";

// Single blob store for all uploaded project documents. Blobs are keyed by
// the document's own UUID (the documents.id column), never by user-supplied
// filename, so there's no path-traversal or collision surface from what
// someone names their file.
export function documentsStore() {
  return getStore("documents");
}
