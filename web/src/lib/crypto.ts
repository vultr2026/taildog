import { b64urlToBytes, bytesToB64url, randomBytes } from "@/lib/bytes";
import { KDF_ITERATIONS, type SealedPayload } from "@/lib/payload";

const TEXT = new TextEncoder();
const TEXT_DEC = new TextDecoder();
const VERIFIER_PLAIN = "TAILDOG-OK";
const HKDF_INFO = TEXT.encode("taildog-v1-content");

export function hasSubtleCrypto(): boolean {
  return typeof globalThis.crypto?.subtle?.encrypt === "function";
}

export function newFuse(): string {
  return bytesToB64url(randomBytes(32));
}

async function pbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iter: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    TEXT.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: iter,
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

async function aesKeyFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

async function contentKeyFrom(
  pwBits: Uint8Array,
  fuse: Uint8Array,
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    pwBits as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: fuse as BufferSource,
      info: HKDF_INFO,
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function aesEncrypt(
  key: CryptoKey,
  plain: Uint8Array,
): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plain as BufferSource,
    ),
  );
  return { iv, ct };
}

async function aesDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ct: Uint8Array,
): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    ),
  );
}

async function gzipMaybe(
  data: Uint8Array,
): Promise<{ bytes: Uint8Array; z: boolean }> {
  if (typeof CompressionStream === "undefined") {
    return { bytes: data, z: false };
  }
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return { bytes, z: true };
}

async function gunzipMaybe(data: Uint8Array, z: boolean): Promise<Uint8Array> {
  if (!z) return data;
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function sealPlaintext(
  plaintext: string,
  password: string,
  fuseId: string,
  fuseB64: string,
): Promise<SealedPayload> {
  const salt = randomBytes(16);
  const fuse = b64urlToBytes(fuseB64);
  const pwBits = await pbkdf2Bits(password, salt, KDF_ITERATIONS);
  const pwKey = await aesKeyFromRaw(pwBits);
  const verifier = await aesEncrypt(pwKey, TEXT.encode(VERIFIER_PLAIN));
  const packed = await gzipMaybe(TEXT.encode(plaintext));
  const cKey = await contentKeyFrom(pwBits, fuse);
  const body = await aesEncrypt(cKey, packed.bytes);
  return {
    v: 1,
    id: fuseId,
    iter: KDF_ITERATIONS,
    salt: bytesToB64url(salt),
    vIv: bytesToB64url(verifier.iv),
    vCt: bytesToB64url(verifier.ct),
    iv: bytesToB64url(body.iv),
    ct: bytesToB64url(body.ct),
    ...(packed.z ? { z: 1 as const } : {}),
  };
}

export async function verifyPassword(
  payload: SealedPayload,
  password: string,
): Promise<Uint8Array> {
  const pwBits = await pbkdf2Bits(
    password,
    b64urlToBytes(payload.salt),
    payload.iter,
  );
  const pwKey = await aesKeyFromRaw(pwBits);
  try {
    const plain = await aesDecrypt(
      pwKey,
      b64urlToBytes(payload.vIv),
      b64urlToBytes(payload.vCt),
    );
    if (TEXT_DEC.decode(plain) !== VERIFIER_PLAIN) throw new Error("bad");
  } catch {
    throw new Error("PASSWORD");
  }
  return pwBits;
}

export async function openPlaintext(
  payload: SealedPayload,
  pwBits: Uint8Array,
  fuseB64: string,
): Promise<string> {
  const cKey = await contentKeyFrom(pwBits, b64urlToBytes(fuseB64));
  let packed: Uint8Array;
  try {
    packed = await aesDecrypt(
      cKey,
      b64urlToBytes(payload.iv),
      b64urlToBytes(payload.ct),
    );
  } catch {
    throw new Error("CIPHER");
  }
  const raw = await gunzipMaybe(packed, payload.z === 1);
  return TEXT_DEC.decode(raw);
}

export function passwordStrength(password: string): "weak" | "ok" | "strong" {
  if (password.length < 8) return "weak";
  if (password.length >= 12 || /\s/.test(password)) return "strong";
  return "ok";
}
