import { FUSE_B64_RE } from "@/lib/bytes";

const STORAGE_KEY = "taildog.fuseServer";

// Build-time default (set via VITE_FUSE_SERVER at build). The user's in-app
// Settings override this, so a changing tunnel URL can be fixed without a rebuild.
const DEFAULT_SERVER =
  ((import.meta.env.VITE_FUSE_SERVER as string | undefined) ?? "").trim() || undefined;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DepositResult = {
  id: string;
  expiresAt: string;
};

export type ConsumeResult =
  | { status: "ok"; fuse: string }
  | { status: "consumed" }
  | { status: "expired" }
  | { status: "missing" };

export function getFuseServer(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) return v.trim();
  } catch {
    // ignore storage failures
  }
  return DEFAULT_SERVER || null;
}

/** Where the currently effective server URL comes from. */
export function getFuseServerSource(): "override" | "default" | "none" {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v.trim()) return "override";
  } catch {
    // ignore
  }
  return DEFAULT_SERVER ? "default" : "none";
}

export function setFuseServer(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, "");
  try {
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures (private mode).
  }
}

export function hasFuseServer(): boolean {
  return getFuseServer() !== null;
}

function baseUrl(): string {
  const url = getFuseServer();
  if (!url) throw new Error("NOSERVER");
  return url.replace(/\/+$/, "");
}

// ngrok free tier serves an interstitial "visit site" page to browser-like
// user agents. Our Android WebView fetch sends a Chrome UA, so we tag every
// request with ngrok's documented skip header to bypass it. Harmless for
// non-ngrok servers, and it makes the app behave like `curl` from the
// tunnel's perspective.
const SKIP_NGROK_HEADER = { "ngrok-skip-browser-warning": "true" };

async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...SKIP_NGROK_HEADER, ...(init.headers ?? {}) },
  });
}

export async function depositFuse(data: { fuse: string }): Promise<DepositResult> {
  if (typeof data.fuse !== "string" || !FUSE_B64_RE.test(data.fuse)) {
    throw new Error("Invalid fuse");
  }
  const res = await apiFetch(`${baseUrl()}/v1/fuses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fuse: data.fuse }),
  });
  if (!res.ok) throw new Error("DEPOSIT_FAILED");
  return (await res.json()) as DepositResult;
}

export async function consumeFuse(data: { id: string }): Promise<ConsumeResult> {
  if (typeof data.id !== "string" || !UUID_RE.test(data.id)) {
    throw new Error("Invalid id");
  }
  const res = await apiFetch(`${baseUrl()}/v1/fuses/consume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: data.id }),
  });
  if (!res.ok) throw new Error("CONSUME_FAILED");
  return (await res.json()) as ConsumeResult;
}

// --- Short-ID sharing (letters) ---

export type LetterResult = { id: string; expiresAt: string | null };

export type OpenLetterResult =
  | { status: "ok"; fuse: string; ct: string }
  | { status: "burned" }
  | { status: "missing" };

/** Fetch the server's stable id, used by clients to derive a server-binding tag. */
export async function fetchServerId(): Promise<{ ok: true; serverId: string }> {
  const res = await apiFetch(`${baseUrl()}/v1/info`, { method: "GET" });
  if (!res.ok) throw new Error("SERVER_INFO_FAILED");
  return (await res.json()) as { ok: true; serverId: string };
}

/** Store a sealed letter (fuse + ciphertext) on the server; returns its id. */
export async function depositLetter(data: {
  fuse: string;
  ct: string;
}): Promise<LetterResult> {
  if (typeof data.fuse !== "string" || !FUSE_B64_RE.test(data.fuse)) {
    throw new Error("Invalid fuse");
  }
  if (typeof data.ct !== "string" || data.ct.length === 0) {
    throw new Error("Invalid ct");
  }
  const res = await apiFetch(`${baseUrl()}/v1/letters`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fuse: data.fuse, ct: data.ct }),
  });
  if (!res.ok) throw new Error("DEPOSIT_FAILED");
  return (await res.json()) as LetterResult;
}

/** Retrieve and burn a letter. On success returns the fuse + ciphertext. */
export async function fetchLetter(data: { id: string }): Promise<OpenLetterResult> {
  if (typeof data.id !== "string" || !UUID_RE.test(data.id)) {
    throw new Error("Invalid id");
  }
  const res = await apiFetch(`${baseUrl()}/v1/letters/${data.id}`, { method: "GET" });
  if (!res.ok) {
    try {
      const body = await res.json();
      if (body && body.status) return body as OpenLetterResult;
    } catch {
      // fall through to generic error
    }
    throw new Error("FETCH_FAILED");
  }
  return (await res.json()) as OpenLetterResult;
}

export async function testFuseServer(url: string): Promise<boolean> {
  try {
    const res = await apiFetch(`${url.trim().replace(/\/+$/, "")}/healthz`, {
      method: "GET",
    });
    return res.ok;
  } catch {
    return false;
  }
}
