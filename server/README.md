# Taildog Fuse Server

Self-hosted one-time "fuse" server for [Taildog](../README.md). Zero dependencies — uses only
Node.js built-ins (`node:http` + `node:sqlite`). Requires **Node.js ≥ 22.5**.

It stores the one-time keys that let a sealed letter be opened exactly once. It **never sees** the
message or the passphrase — those are encrypted locally in the client.

## Run

```bash
node src/index.mjs
# or
npm start
```

The server listens on `http://0.0.0.0:8787` by default.

## Configuration (environment variables)

| Variable            | Default                  | Description                                        |
| ------------------- | ------------------------ | -------------------------------------------------- |
| `PORT`              | `8787`                   | HTTP port                                          |
| `HOST`              | `0.0.0.0`                | Bind address                                       |
| `TAILDOG_DB`        | `./taildog.db`           | SQLite database file path                          |
| `FUSE_TTL_DAYS`     | `7`                      | How many days an unopened fuse stays valid         |
| `TAILDOG_TLS_CERT`  | _(unset)_                | Path to a TLS certificate (enables HTTPS)          |
| `TAILDOG_TLS_KEY`   | _(unset)_                | Path to a TLS private key (enables HTTPS)          |

Example:

```bash
PORT=9000 FUSE_TTL_DAYS=30 node src/index.mjs
```

## API

| Method | Path                | Body            | Response                                                |
| ------ | ------------------- | --------------- | ------------------------------------------------------- |
| GET    | `/healthz`          | —               | `200 {"ok":true}`                                       |
| POST   | `/v1/fuses`         | `{"fuse":"…"}`  | `201 {"id":"…","expiresAt":"…"}`                        |
| POST   | `/v1/fuses/consume` | `{"id":"…"}`    | `200 {"status":"ok","fuse":"…"}` or `{"status":"consumed"\|"expired"\|"missing"}` |

The `consume` endpoint is **atomic and one-shot**: the first successful request withdraws the fuse
and nulls it, so any later request for the same id returns `"consumed"`.

## HTTPS

Two options when you move to a VPS with a domain:

1. **Reverse proxy (recommended)** — put Caddy or Nginx in front and let it terminate TLS:

   ```caddyfile
   taildog.example.com {
       reverse_proxy localhost:8787
   }
   ```

2. **Built-in TLS** — set `TAILDOG_TLS_CERT` and `TAILDOG_TLS_KEY` to a certificate and key and the
   server switches to HTTPS on its own.

> The plain-HTTP server is fine for the APK / local-IP use case, but a web app served over HTTPS
> must reach the fuse server over HTTPS too (browsers block mixed content).

## Docker

```bash
docker build -t taildog-server .
docker run -p 8787:8787 -v "$(pwd)/data:/app/data" -e TAILDOG_DB=/app/data/taildog.db taildog-server
```
