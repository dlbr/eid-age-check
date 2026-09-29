import { createError } from "h3";

const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  const raw = encoder.encode(secret);
  if (raw.byteLength < 32) {
    throw createError({
      statusCode: 500,
      statusMessage: "Age-check cookie secret must be at least 32 bytes",
    });
  }
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Signs one opaque Gateway session ID for the browser that created it. */
export async function createAgeCheckSessionCookie(
  sessionId: string,
  secret: string,
  expiresAt: number,
): Promise<string> {
  const id = encodeBase64Url(encoder.encode(sessionId));
  const payload = `${id}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await importSigningKey(secret), encoder.encode(payload));
  return `v1.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/** Gives concurrent checks separate cookies without storing their IDs server-side. */
export async function ageCheckSessionCookieName(baseName: string, sessionId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(sessionId));
  return `${baseName}_${encodeBase64Url(new Uint8Array(digest)).slice(0, 16)}`;
}

/** Confirms a status request can access only the session bound to its signed cookie. */
export async function verifyAgeCheckSessionCookie(
  token: string | undefined,
  sessionId: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const [version, encodedId, expiresAtText, encodedSignature, ...extra] = token.split(".");
  if (version !== "v1" || !encodedId || !expiresAtText || !encodedSignature || extra.length > 0) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;

  try {
    const decodedId = new TextDecoder().decode(decodeBase64Url(encodedId));
    if (decodedId !== sessionId) return false;
    const payload = `${encodedId}.${expiresAtText}`;
    return await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(secret),
      asArrayBuffer(decodeBase64Url(encodedSignature)),
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}
