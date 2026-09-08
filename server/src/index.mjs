#!/usr/bin/env node
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const TTL_DAYS = Number(process.env.FUSE_TTL_DAYS || 7);
const DB_PATH = process.env.TAILDOG_DB || join(__dirname, "..", "taildog.db");
const TLS_CERT = process.env.TAILDOG_TLS_CERT;
const TLS_KEY = process.env.TAILDOG_TLS_KEY;

const FUSE_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!Number.isFinite(TTL_DAYS) || TTL_DAYS <= 0) {
  console.error("FUSE_TTL_DAYS must be a positive number.");
  process.exit(1);
}

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS fuses (
    id          TEXT PRIMARY KEY,
    fuse        TEXT,
    consumed_at TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fuses_expires_at_idx ON fuses (expires_at);
  CREATE TABLE IF NOT EXISTS letters (
    id          TEXT PRIMARY KEY,
    fuse        TEXT NOT NULL,
    ct          TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS letters_expires_at_idx ON letters (expires_at);
  CREATE TABLE IF NOT EXISTS letter_burned (
    id          TEXT PRIMARY KEY,
    burned_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS meta (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
  );
`);

const ttlInterval = `+${TTL_DAYS} days`;

const insertFuse = db.prepare(
  "INSERT INTO fuses (id, fuse, expires_at) VALUES (?, ?, datetime('now', ?))",
);
const getExpiry = db.prepare("SELECT expires_at FROM fuses WHERE id = ?");
const selectAvailableFuse = db.prepare(
  "SELECT fuse FROM fuses WHERE id = ? AND fuse IS NOT NULL AND fuse <> '' AND consumed_at IS NULL AND expires_at > datetime('now')",
);
const markConsumed = db.prepare(
  "UPDATE fuses SET fuse = NULL, consumed_at = datetime('now') WHERE id = ?",
);
const selectFuse = db.prepare(
  "SELECT consumed_at, (expires_at <= datetime('now')) AS expired FROM fuses WHERE id = ?",
);

// --- Letters (short-ID sharing): ct + fuse stored server-side, burned on open ---
const insertLetter = db.prepare(
  "INSERT INTO letters (id, fuse, ct, expires_at) VALUES (?, ?, ?, datetime('now', ?))",
);
const selectLetter = db.prepare(
  "SELECT fuse, ct FROM letters WHERE id = ? AND expires_at > datetime('now')",
);
const deleteLetter = db.prepare("DELETE FROM letters WHERE id = ?");
const insertBurned = db.prepare("INSERT OR IGNORE INTO letter_burned (id) VALUES (?)");
const selectBurned = db.prepare("SELECT 1 FROM letter_burned WHERE id = ?");
const getLetterExpiry = db.prepare("SELECT expires_at FROM letters WHERE id = ?");
const deleteExpiredLetters = db.prepare("DELETE FROM letters WHERE expires_at <= datetime('now')");
const deleteExpiredBurned = db.prepare(
  "DELETE FROM letter_burned WHERE burned_at <= datetime('now', ?)",
);

// Stable per-instance server id (persisted). Used by clients to derive a
// server-binding tag so the same VPS keeps matching across ngrok restarts.
const SERVER_ID = (() => {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'server_id'").get();
  if (row && row.value) return row.value;
  const id = randomUUID();
  db.prepare("INSERT INTO meta (key, value) VALUES ('server_id', ?)").run(id);
  return id;
})();

// Atomic, one-shot consumption: read the fuse under an immediate write lock,
// null it, and commit — so a second request can never obtain the same fuse.
function consume(id) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = selectAvailableFuse.get(id);
    if (row) {
      markConsumed.run(id);
      db.exec("COMMIT");
      return { status: "ok", fuse: row.fuse };
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // rollback failed (connection died) — keep the original error
    }
    throw err;
  }
  const info = selectFuse.get(id);
  if (!info) return { status: "missing" };
  if (Number(info.expired) === 1) return { status: "expired" };
  return { status: "consumed" };
}

// Atomic, one-shot consumption for letters: return the fuse + ciphertext and
// delete the row so the encrypted blob is never retained after being read.
function consumeLetter(id) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = selectLetter.get(id);
    if (row) {
      deleteLetter.run(id);
      insertBurned.run(id);
      db.exec("COMMIT");
      return { status: "ok", fuse: row.fuse, ct: row.ct };
    }
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // rollback failed (connection died) — keep the original error
    }
    throw err;
  }
  const burned = selectBurned.get(id);
  if (burned) return { status: "burned" };
  return { status: "missing" };
}

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    // The client sends `ngrok-skip-browser-warning` to bypass ngrok's interstitial;
    // that's a non-CORS-safelisted header and triggers an OPTIONS check, so it
    // must be allowed here (along with content-type). Allowing `*` is fine — the
    // API has no auth and the server never sees plaintext or passphrases.
    "access-control-allow-headers": "*",
    "access-control-max-age": "86400",
    ...extra,
  };
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4_000_000) {
        reject(new Error("payload too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (req.method === "GET" && path === "/healthz") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "POST" && path === "/v1/fuses") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: "invalid json body" });
    }
    if (typeof body.fuse !== "string" || !FUSE_RE.test(body.fuse)) {
      return json(res, 400, { error: "invalid fuse" });
    }
    const id = randomUUID();
    insertFuse.run(id, body.fuse, ttlInterval);
    const row = getExpiry.get(id);
    return json(res, 201, { id, expiresAt: row.expires_at });
  }

  if (req.method === "POST" && path === "/v1/fuses/consume") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: "invalid json body" });
    }
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return json(res, 400, { error: "invalid id" });
    }
    return json(res, 200, consume(body.id));
  }

  if (req.method === "GET" && path === "/v1/info") {
    return json(res, 200, { ok: true, serverId: SERVER_ID });
  }

  if (req.method === "POST" && path === "/v1/letters") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: "invalid json body" });
    }
    if (typeof body.fuse !== "string" || !FUSE_RE.test(body.fuse)) {
      return json(res, 400, { error: "invalid fuse" });
    }
    if (
      typeof body.ct !== "string" ||
      body.ct.length === 0 ||
      body.ct.length > 4_000_000
    ) {
      return json(res, 400, { error: "invalid ct" });
    }
    const id = randomUUID();
    insertLetter.run(id, body.fuse, body.ct, ttlInterval);
    const row = getLetterExpiry.get(id);
    return json(res, 201, { id, expiresAt: row ? row.expires_at : null });
  }

  if (req.method === "GET" && path.startsWith("/v1/letters/")) {
    const id = decodeURIComponent(path.slice("/v1/letters/".length));
    if (!UUID_RE.test(id)) return json(res, 400, { error: "invalid id" });
    const result = consumeLetter(id);
    if (result.status === "ok") return json(res, 200, result);
    return json(res, 404, result);
  }

  return json(res, 404, { error: "not found" });
}

const useTls = Boolean(TLS_CERT && TLS_KEY);
const server = useTls
  ? createHttpsServer(
      { cert: readFileSync(TLS_CERT), key: readFileSync(TLS_KEY) },
      handler,
    )
  : createServer(handler);

server.listen(PORT, HOST, () => {
  console.log(
    `[taildog] fuse server listening on ${useTls ? "https" : "http"}://${HOST}:${PORT}`,
  );
  console.log(`[taildog] database: ${DB_PATH} (ttl=${TTL_DAYS}d)`);
  console.log(`[taildog] serverId: ${SERVER_ID}`);
});

// Periodic purge of expired letters (and their burn receipts) so the encrypted
// blobs and markers do not accumulate forever.
function purgeExpired() {
  try {
    deleteExpiredLetters.run();
    // Keep a burn receipt for TTL_DAYS after it was written, then drop it so
    // the table does not grow without bound. (Was `+` — never matched.)
    deleteExpiredBurned.run(`-${TTL_DAYS} days`);
  } catch {
    // ignore purge errors
  }
}
purgeExpired();
const purgeTimer = setInterval(purgeExpired, 60 * 60 * 1000);
if (typeof purgeTimer.unref === "function") purgeTimer.unref();
