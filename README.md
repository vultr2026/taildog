# Taildog

A letter you can open only once.

Taildog seals a message into ciphertext on **your device** and lets the recipient open it **exactly
once**. The message and passphrase never leave the two of you — the server only holds a one-time
"fuse" that makes a letter unopenable after it is read (or after 7 days).

Rebuilt as a standalone, self-hostable app.

## What's inside

| Path         | What it is                                                            |
| ------------ | --------------------------------------------------------------------- |
| `web/`       | The app — a static Vite + React single-page app (English UI)          |
| `server/`    | The self-hosted fuse server — Node ≥ 22.5, zero dependencies, SQLite  |

## Quick start (local)

### 1. Start the fuse server

```bash
cd server
node src/index.mjs
# -> [taildog] fuse server listening on http://0.0.0.0:8787
```

### 2. Start the web app

```bash
cd web
npm install
npm run dev
# -> open http://localhost:8080
```

### 3. Point the app at your server

Open the app, go to the **Settings** tab, enter `http://localhost:8787` (or your LAN IP), and tap
**Save**. The address is remembered on this device.

## How to use it

1. **Write** a message and choose a passphrase only the two of you know → **Seal**.
2. Copy or download the ciphertext and send it to the recipient (the passphrase goes separately).
3. The recipient pastes the ciphertext and the passphrase under **Open** → the letter opens once,
   then burns.

## Deploying / sharing with others

The fuse server is the shared middle point — **both** the writer and the reader must be able to
reach it. Running it on `localhost` only lets you test on your own machine.

To share with people on the internet, expose the server publicly:

- a **VPS** (run `server/` there and open the port), or
- **port forwarding / tunnel** (frp, ngrok, etc.) to your local `8787`.

Then enter that public address in Settings. For a web app served over HTTPS you will also need
HTTPS on the server — see [`server/README.md`](server/README.md) (Caddy/Nginx reverse proxy, or the
built-in TLS switch).

## Security notes

- Encryption: PBKDF2-SHA256 (600k iterations) → AES-256-GCM, with an HKDF step mixing in the fuse.
- The server stores only random one-time fuses; it cannot decrypt anything and never sees plaintext
  or passphrases.
- "Open once" is enforced atomically in SQLite on the server, not just in the client.

## APK

Packaging as an Android APK (via Capacitor) is a follow-up step — see the project plan.
