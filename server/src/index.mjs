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

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
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
      if (size > 1_000_000) {
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
});
