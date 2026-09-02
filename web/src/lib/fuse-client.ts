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

export async function depositFuse(data: { fuse: string }): Promise<DepositResult> {
  if (typeof data.fuse !== "string" || !FUSE_B64_RE.test(data.fuse)) {
    throw new Error("Invalid fuse");
  }
  const res = await fetch(`${baseUrl()}/v1/fuses`, {
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
  const res = await fetch(`${baseUrl()}/v1/fuses/consume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: data.id }),
  });
  if (!res.ok) throw new Error("CONSUME_FAILED");
  return (await res.json()) as ConsumeResult;
}

export async function testFuseServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.trim().replace(/\/+$/, "")}/healthz`, {
      method: "GET",
    });
    return res.ok;
  } catch {
    return false;
  }
}
