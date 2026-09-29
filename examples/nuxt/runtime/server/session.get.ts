import { createError, defineEventHandler, deleteCookie, getCookie, getRouterParam } from "h3";
import { useRuntimeConfig } from "#imports";
import { ageCheckSessionCookieName, verifyAgeCheckSessionCookie } from "./session-cookie";
import { asRecord, createAgeCheckClient, getAgeCheckRuntimeConfig } from "./age-check";

export default defineEventHandler(async (event) => {
  const config = getAgeCheckRuntimeConfig(event);
  const sessionId = getRouterParam(event, "sessionId");
  if (!sessionId || sessionId.length > 256) {
    throw createError({ statusCode: 404, statusMessage: "Age-check session not found" });
  }
  const cookieName = sessionId
    ? await ageCheckSessionCookieName(config.cookieName, sessionId)
    : config.cookieName;
  const token = getCookie(event, cookieName);
  const allowed = sessionId
    ? await verifyAgeCheckSessionCookie(token, sessionId, config.cookieSecret)
    : false;
  if (!sessionId || !allowed) {
    throw createError({ statusCode: 404, statusMessage: "Age-check session not found" });
  }

  try {
    const session = await createAgeCheckClient(config).sessions.get(sessionId);
    const endpoint = useRuntimeConfig(event).public.dlbrAgeCheck.endpoint;
    const clearCookie = () => deleteCookie(event, cookieName, { path: endpoint });

    if (session.status === "FAILED" || session.status === "EXPIRED") {
      clearCookie();
      return { status: session.status };
    }
    if (session.status !== "VERIFIED") return { status: "PENDING" };

    const proofOfAge = asRecord(session.claims?.["proof-of-age"]);
    const namespace = asRecord(proofOfAge?.["eu.europa.ec.av.1"]);
    const ageOver18 = namespace?.age_over_18;
    clearCookie();
    if (typeof ageOver18 !== "boolean") return { status: "FAILED" };
    return { status: "VERIFIED", age_over_18: ageOver18 };
  } catch {
    throw createError({ statusCode: 502, statusMessage: "Age verification is temporarily unavailable" });
  }
});
