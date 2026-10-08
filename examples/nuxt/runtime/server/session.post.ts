import { createError, defineEventHandler, getRequestURL, setCookie } from "h3";
import { useRuntimeConfig } from "#imports";
import type { Session } from "@dlbr/eid-sdk";
import { ageCheckSessionCookieName, createAgeCheckSessionCookie } from "./session-cookie";
import { assertSameOrigin, createAgeCheckClient, getAgeCheckRuntimeConfig } from "./age-check";

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const config = getAgeCheckRuntimeConfig(event);

  let session: Session;
  try {
    session = await createAgeCheckClient(config).sessions.create({
      credentials: [{
        id: "proof-of-age",
        format: "mso_mdoc",
        issuer_id: config.issuerId,
        trust_domain: "pub_eaa",
        namespace: "eu.europa.ec.av.1",
        doc_type: "eu.europa.ec.av.1",
        claims: ["age_over_18"],
      }],
    });
    if (!session.session_id || !session.qr_code_url) {
      throw new Error("The Gateway returned an invalid age-check session");
    }
  } catch (error) {
    console.error("dlbr-age-check: session creation failed", error);
    throw createError({ statusCode: 502, statusMessage: "Age verification is temporarily unavailable" });
  }

  const gatewayExpiresAt = Date.parse(session.expires_at);
  if (!Number.isFinite(gatewayExpiresAt) || gatewayExpiresAt <= Date.now()) {
    throw createError({ statusCode: 502, statusMessage: "Age verification is temporarily unavailable" });
  }
  const expiresAt = Math.min(Date.now() + config.sessionTtlSeconds * 1000, gatewayExpiresAt);
  const cookie = await createAgeCheckSessionCookie(session.session_id, config.cookieSecret, expiresAt);
  const cookieName = await ageCheckSessionCookieName(config.cookieName, session.session_id);
  setCookie(event, cookieName, cookie, {
    httpOnly: true,
    secure: getRequestURL(event).protocol === "https:",
    sameSite: "strict",
    path: useRuntimeConfig(event).public.dlbrAgeCheck.endpoint,
    maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
  });
  return { session_id: session.session_id, qr_code_url: session.qr_code_url, expires_at: new Date(expiresAt).toISOString() };
});
