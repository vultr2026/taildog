import { bytesToB64url } from "@/lib/bytes";

// Derive a short, stable server-binding tag from the server's stable id.
// 6 bytes of SHA-256 -> ~8 chars base64url. The tag is a one-way fingerprint
// of the server id and cannot be reversed to recover it.
export async function serverTag(serverId: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serverId),
  );
  const bytes = new Uint8Array(digest).slice(0, 6);
  return bytesToB64url(bytes);
}
