export type AgeCheckStatus = "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";

export interface CreateAgeCheckSessionResponse {
  session_id: string;
  qr_code_url: string;
}

export interface AgeCheckSessionResponse {
  status: AgeCheckStatus;
  age_over_18?: boolean;
}

/** Error raised when a merchant endpoint violates the widget's response contract. */
export class AgeCheckProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgeCheckProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves a same-origin HTTP endpoint and rejects unsafe or malformed URLs. */
export function resolveEndpoint(endpoint: string, baseURI: string): URL {
  if (typeof endpoint !== "string" || endpoint.trim() === "") {
    throw new AgeCheckProtocolError("The age-check endpoint is required.");
  }

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(baseURI);
    resolved = new URL(endpoint, base);
  } catch {
    throw new AgeCheckProtocolError("The age-check endpoint is not a valid URL.");
  }

  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
    throw new AgeCheckProtocolError("The age-check endpoint must use HTTP or HTTPS.");
  }
  if (resolved.origin !== base.origin) {
    throw new AgeCheckProtocolError("The age-check endpoint must be same-origin.");
  }
  if (resolved.username || resolved.password || resolved.search || resolved.hash) {
    throw new AgeCheckProtocolError("The age-check endpoint cannot include credentials, a query, or a fragment.");
  }

  resolved.pathname = resolved.pathname.replace(/\/+$/, "") || "/";
  return resolved;
}

/** Creates the merchant-owned session creation URL. */
export function createSessionUrl(endpoint: string, baseURI: string): URL {
  const resolved = resolveEndpoint(endpoint, baseURI);
  resolved.pathname = (resolved.pathname.replace(/\/+$/, "") || "") + "/sessions";
  return resolved;
}

/** Creates the merchant-owned status URL for an opaque session identifier. */
export function createStatusUrl(endpoint: string, sessionId: string, baseURI: string): URL {
  if (typeof sessionId !== "string" || sessionId.trim() === "" || sessionId.length > 256) {
    throw new AgeCheckProtocolError("The age-check session identifier is invalid.");
  }
  const resolved = resolveEndpoint(endpoint, baseURI);
  resolved.pathname = (resolved.pathname.replace(/\/+$/, "") || "") + "/sessions/" + encodeURIComponent(sessionId);
  return resolved;
}

/** Validates a wallet request URI before the widget places it in a link or QR code. */
export function validateWalletRequestUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "" || /[\u0000-\u0020<>"']/.test(value)) {
    throw new AgeCheckProtocolError("The wallet request URL is invalid.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AgeCheckProtocolError("The wallet request URL is invalid.");
  }

  if (url.protocol === "openid4vp:" || url.protocol === "av:") return value;
  if (url.protocol === "https:" && url.hostname !== "") return value;
  throw new AgeCheckProtocolError("The wallet request URL must use OpenID4VP, AV, or HTTPS.");
}

/** Validates the minimal response returned by the merchant's session creation endpoint. */
export function parseCreateSessionResponse(value: unknown): CreateAgeCheckSessionResponse {
  if (!isRecord(value)) {
    throw new AgeCheckProtocolError("The age-check session response is invalid.");
  }
  if (typeof value.session_id !== "string" || value.session_id.trim() === "" || value.session_id.length > 256) {
    throw new AgeCheckProtocolError("The age-check session identifier is invalid.");
  }
  return {
    session_id: value.session_id,
    qr_code_url: validateWalletRequestUrl(value.qr_code_url),
  };
}

/** Validates and normalizes the minimal result returned by the merchant's status endpoint. */
export function parseAgeCheckSessionResponse(value: unknown): AgeCheckSessionResponse {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new AgeCheckProtocolError("The age-check status response is invalid.");
  }

  const status = value.status.toUpperCase();
  if (status === "CREATED" || status === "PENDING") return { status: "PENDING" };
  if (status === "VERIFIED") {
    if (typeof value.age_over_18 !== "boolean") {
      throw new AgeCheckProtocolError("The verified response must include a boolean age_over_18 result.");
    }
    return { status, age_over_18: value.age_over_18 };
  }
  if (status === "FAILED" || status === "EXPIRED") return { status };
  throw new AgeCheckProtocolError("The age-check status is unsupported.");
}
