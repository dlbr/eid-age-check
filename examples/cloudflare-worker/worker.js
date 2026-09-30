import { DlbrId } from "@dlbr/eid-sdk";

const cookieName = "dlbr_age_check";
const sessionLifetimeSeconds = 30 * 60;

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function getGateway(env) {
  if (
    !env.DLBR_EID_BASE_URL ||
    !env.DLBR_EID_API_KEY ||
    !env.DLBR_EID_AGE_ISSUER_ID ||
    !env.DLBR_EID_INTENDED_USE_ID
  ) {
    throw new Error("The Gateway configuration is incomplete.");
  }

  return new DlbrId({
    baseUrl: env.DLBR_EID_BASE_URL,
    apiKey: env.DLBR_EID_API_KEY,
    fetch: globalThis.fetch.bind(globalThis),
    maxNetworkRetries: 1,
    timeoutMs: 10_000,
  });
}

function logSessionFailure(stage, error) {
  const cause = error?.cause;
  const nestedCause = cause?.cause;
  const safeName = (value) => value instanceof Error && /^[A-Za-z0-9_]{1,64}$/.test(value.name)
    ? value.name
    : undefined;
  const safeCode = (value) => typeof value === "string" && /^[A-Z0-9_]{1,64}$/.test(value)
    ? value
    : undefined;
  const details = {
    operation: "create_age_check_session",
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    kind: typeof error?.kind === "string" ? error.kind : undefined,
    status: Number.isInteger(error?.status) ? error.status : undefined,
    code: typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : undefined,
    requestId: typeof error?.requestId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(error.requestId)
      ? error.requestId
      : undefined,
    causeName: safeName(cause),
    causeCode: safeCode(cause?.code),
    nestedCauseName: safeName(nestedCause),
    nestedCauseCode: safeCode(nestedCause?.code),
  };
  console.error("Age-check session creation failed", details);
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  const value = request.headers.get("Cookie");
  if (!value) return null;

  for (const part of value.split(";")) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) return cookie.slice(prefix.length);
  }
  return null;
}

function newBrowserToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieHeader(token, requestUrl) {
  const secure = requestUrl.protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${secure}`;
}

async function createSession(request, env, url) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }
  if (request.headers.get("Origin") !== url.origin) {
    return jsonResponse({ error: "Origin not allowed." }, 403);
  }

  let stage = "gateway_configuration";
  try {
    const gateway = getGateway(env);
    stage = "gateway_session_create";
    const session = await gateway.sessions.create({
      intended_use_id: env.DLBR_EID_INTENDED_USE_ID,
      credentials: [{
        id: "proof-of-age",
        format: "mso_mdoc",
        issuer_id: env.DLBR_EID_AGE_ISSUER_ID,
        trust_domain: "pub_eaa",
        namespace: "eu.europa.ec.av.1",
        doc_type: "eu.europa.ec.av.1",
        claims: ["age_over_18"],
      }],
    });

    const existingToken = readCookie(request, cookieName);
    const browserToken = existingToken && /^[A-Za-z0-9_-]{43}$/.test(existingToken)
      ? existingToken
      : newBrowserToken();
    stage = "gateway_session_response_validation";
    const expiresAt = Date.parse(session.expires_at);
    if (!session.session_id || !session.qr_code_url || !Number.isFinite(expiresAt)) {
      throw new Error("The Gateway returned an invalid session response.");
    }

    stage = "d1_session_persist";
    await env.SESSIONS.prepare(
      "INSERT INTO age_check_sessions (session_id, browser_token_hash, expires_at) VALUES (?, ?, ?)",
    ).bind(session.session_id, await hashToken(browserToken), expiresAt).run();

    return jsonResponse(
      { session_id: session.session_id, qr_code_url: session.qr_code_url },
      201,
      { "Set-Cookie": cookieHeader(browserToken, url) },
    );
  } catch (error) {
    logSessionFailure(stage, error);
    return jsonResponse({ error: "Could not start age verification." }, 503);
  }
}

function getAgeOver18(claims) {
  const credential = claims?.["proof-of-age"];
  const namespace = credential?.["eu.europa.ec.av.1"];
  return namespace?.age_over_18;
}

async function readSession(request, env, sessionId) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
  }
  if (!sessionId || sessionId.length > 256) return jsonResponse({ error: "Session not found." }, 404);

  try {
    const browserToken = readCookie(request, cookieName);
    if (!browserToken || !/^[A-Za-z0-9_-]{43}$/.test(browserToken)) {
      return jsonResponse({ error: "Session not found." }, 404);
    }
    const tokenHash = await hashToken(browserToken);
    const stored = await env.SESSIONS.prepare(
      "SELECT expires_at FROM age_check_sessions WHERE session_id = ? AND browser_token_hash = ?",
    ).bind(sessionId, tokenHash).first();
    if (!stored) return jsonResponse({ error: "Session not found." }, 404);

    if (Date.now() >= stored.expires_at) {
      await env.SESSIONS.prepare("DELETE FROM age_check_sessions WHERE session_id = ?").bind(sessionId).run();
      return jsonResponse({ status: "EXPIRED" });
    }

    const session = await getGateway(env).sessions.retrieve(sessionId);
    if (session.status === "VERIFIED") {
      const ageOver18 = getAgeOver18(session.claims);
      await env.SESSIONS.prepare("DELETE FROM age_check_sessions WHERE session_id = ?").bind(sessionId).run();
      return typeof ageOver18 === "boolean"
        ? jsonResponse({ status: "VERIFIED", age_over_18: ageOver18 })
        : jsonResponse({ status: "FAILED" });
    }
    if (session.status === "FAILED" || session.status === "EXPIRED") {
      await env.SESSIONS.prepare("DELETE FROM age_check_sessions WHERE session_id = ?").bind(sessionId).run();
      return jsonResponse({ status: session.status });
    }
    return jsonResponse({ status: "PENDING" });
  } catch {
    return jsonResponse({ error: "Could not retrieve age verification status." }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const collectionPath = "/api/age-check/sessions";
    if (url.pathname === collectionPath) return createSession(request, env, url);

    const sessionMatch = url.pathname.match(/^\/api\/age-check\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      let sessionId;
      try {
        sessionId = decodeURIComponent(sessionMatch[1]);
      } catch {
        return jsonResponse({ error: "Session not found." }, 404);
      }
      return readSession(request, env, sessionId);
    }

    if (url.pathname.startsWith("/api/")) return jsonResponse({ error: "Not found." }, 404);
    return new Response("Not found.", { status: 404 });
  },
};
