import { b64urlToBytes, bytesToB64url } from "@/lib/bytes";

export const ARMOR_PREFIX = "taildog-1.";
export const KDF_ITERATIONS = 600_000;
export const FUSE_TTL_DAYS = 7;
export const MAX_PLAINTEXT = 80_000;

export type SealedPayload = {
  v: 1;
  id: string;
  iter: number;
  salt: string;
  vIv: string;
  vCt: string;
  iv: string;
  ct: string;
  z?: 1;
};

export function encodeArmor(payload: SealedPayload): string {
  const json = JSON.stringify(payload);
  return `${ARMOR_PREFIX}\n${bytesToB64url(new TextEncoder().encode(json))}`;
}

export function decodeArmor(raw: string): SealedPayload {
  const trimmed = raw.trim().replace(/\r\n/g, "\n");
  if (!trimmed) throw new Error("EMPTY");

  let jsonText = trimmed;
  if (trimmed.startsWith(ARMOR_PREFIX)) {
    const body = trimmed.slice(ARMOR_PREFIX.length).replace(/\s+/g, "");
    jsonText = new TextDecoder().decode(b64urlToBytes(body));
  } else if (trimmed.startsWith("{")) {
    jsonText = trimmed;
  } else {
    try {
      jsonText = new TextDecoder().decode(b64urlToBytes(trimmed.replace(/\s+/g, "")));
    } catch {
      throw new Error("FORMAT");
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("FORMAT");
  }
  if (!isSealedPayload(parsed)) throw new Error("FORMAT");
  return parsed;
}

function isSealedPayload(value: unknown): value is SealedPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === 1 &&
    typeof v.id === "string" &&
    typeof v.iter === "number" &&
    typeof v.salt === "string" &&
    typeof v.vIv === "string" &&
    typeof v.vCt === "string" &&
    typeof v.iv === "string" &&
    typeof v.ct === "string" &&
    (v.z === undefined || v.z === 1)
  );
}
