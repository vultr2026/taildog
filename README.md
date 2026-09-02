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

Then the recipient needs to know **where the fuse server is**. There are two ways to give them the
address (it is *not* a secret — the server never sees plaintext or passphrases, only a random key):

1. **Bake it into the build** (zero-config for the recipient — recommended if your address is stable).
2. **Tell them the URL** and let them paste it in the app's **Settings** tab (needed if your address
   changes, e.g. the free ngrok random sub-domain changes on every restart).

### Bake the server address into the build

Set `VITE_FUSE_SERVER` when building. The value becomes the app's default; the recipient still can
override it later in Settings if needed.

```bash
# Web build (replace with YOUR public https address from ngrok/VPS)
cd web
VITE_FUSE_SERVER=https://your-id.ngrok-free.app npm run build
# -> dist/ is now hard-wired to that server, no setup needed on the other side
```

For a web app served over HTTPS you will also need HTTPS on the server — see
[`server/README.md`](server/README.md) (Caddy/Nginx reverse proxy, or the built-in TLS switch).

> Tip: with ngrok, **prefer the `https://` address**. Inside the Android app the WebView runs in a
> secure context, and requesting a plain `http://` server would otherwise be blocked as mixed content.

## Sending a letter to the other party

1. You (the writer) write the message + a passphrase only the two of you know → **Seal** → copy the
   ciphertext.
2. Send the **ciphertext** to the recipient over any channel (WeChat / email / etc.).
3. Send the **passphrase separately** — never in the same message as the ciphertext.
4. The recipient opens the app (APK or web link), pastes the ciphertext + passphrase under **Open**,
   and the letter opens once, then burns.

The fuse-server address is just the location of the shared "mailbox" — it is not a secret and does
not need to travel with the ciphertext.

## Android APK (Capacitor)

The app is packaged as a native Android APK with Capacitor. Prerequisites on the build machine:
Node ≥ 22, **JDK 21** (Capacitor 8's `capacitor-android` compiles against source level 21 — JDK 17 fails with "invalid source release: 21"), and the Android SDK (platform 36 + build-tools 36 + platform-tools).

```bash
# 1. build web assets with the server address baked in
cd web
VITE_FUSE_SERVER=https://your-id.ngrok-free.app npm run build

# 2. sync assets into the native android project (regenerates android/app/src/main/assets/public/)
npx cap sync android

# 3. build the debug APK (run from web/, needs JAVA_HOME=JDK21 and ANDROID_HOME set)
export JAVA_HOME="/c/Program Files/Java/jdk-17.0.2"
export ANDROID_HOME="/c/Program Files (x86)/Android/android-sdk"
cd android && ./gradlew assembleDebug

# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Send `app-debug.apk` to the recipient; on their Android phone allow "Install unknown apps" from the
source, then install. (A release-signed APK is needed for the Play Store — out of scope here.)

## Security notes

- Encryption: PBKDF2-SHA256 (600k iterations) → AES-256-GCM, with an HKDF step mixing in the fuse.
- The server stores only random one-time fuses; it cannot decrypt anything and never sees plaintext
  or passphrases.
- "Open once" is enforced atomically in SQLite on the server, not just in the client.
