// Shared validation regexes. Previously duplicated across crypto/fuse-client,
// open-panel and the server — kept here so the same rule lives in one place.

// A UUID v1–v8 in canonical 8-4-4-4-12 form.
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A 32-byte fuse encoded as url-safe base64 (no padding): 43 chars from the
// alphabet A-Za-z0-9-_. Mirrors FUSE_RE in server/src/index.mjs.
export const FUSE_B64_RE = /^[A-Za-z0-9_-]{43}$/;
