import { describe, expect, it } from "vitest";
import {
  AgeCheckProtocolError,
  createSessionUrl,
  createStatusUrl,
  parseAgeCheckSessionResponse,
  parseCreateSessionResponse,
  resolveEndpoint,
  validateWalletRequestUrl,
} from "../src/protocol.js";

const baseURI = "https://shop.example/checkout";

describe("endpoint URL helpers", () => {
  it("resolves same-origin relative endpoints and strips a trailing slash", () => {
    expect(resolveEndpoint("/api/age-check/", baseURI).href).toBe("https://shop.example/api/age-check");
    expect(createSessionUrl("/api/age-check/", baseURI).href).toBe("https://shop.example/api/age-check/sessions");
    expect(createStatusUrl("/api/age-check", "session-1", baseURI).href)
      .toBe("https://shop.example/api/age-check/sessions/session-1");
  });

  it("builds URLs when the endpoint is the site root", () => {
    expect(resolveEndpoint("/", baseURI).pathname).toBe("/");
    expect(createSessionUrl("/", baseURI).pathname).toBe("/sessions");
    expect(createStatusUrl("/", "session-1", baseURI).pathname).toBe("/sessions/session-1");
  });

  it("encodes session identifiers as one path segment", () => {
    expect(createStatusUrl("/api/age-check", "session/one", baseURI).pathname)
      .toBe("/api/age-check/sessions/session%2Fone");
  });

  it.each(["", "  "])("rejects a missing endpoint (%j)", (endpoint) => {
    expect(() => resolveEndpoint(endpoint, baseURI)).toThrow(AgeCheckProtocolError);
  });

  it("rejects invalid base URLs and endpoint strings", () => {
    expect(() => resolveEndpoint("/age", "not a URL")).toThrow("not a valid URL");
    expect(() => resolveEndpoint("http://[", baseURI)).toThrow("not a valid URL");
  });

  it.each(["javascript:alert(1)", "ftp://shop.example/age"])("rejects unsupported protocols (%s)", (endpoint) => {
    expect(() => resolveEndpoint(endpoint, baseURI)).toThrow("must use HTTP or HTTPS");
  });

  it("rejects cross-origin endpoints", () => {
    expect(() => resolveEndpoint("https://attacker.example/age", baseURI)).toThrow("same-origin");
  });

  it.each([
    "https://user:pass@shop.example/age",
    "https://shop.example/age?debug=1",
    "https://shop.example/age#fragment",
  ])("rejects endpoint credentials, queries, and fragments (%s)", (endpoint) => {
    expect(() => resolveEndpoint(endpoint, baseURI)).toThrow("cannot include credentials");
  });

  it.each(["", " ", "x".repeat(257)])("rejects an invalid session id (%s)", (sessionId) => {
    expect(() => createStatusUrl("/age", sessionId, baseURI)).toThrow("identifier is invalid");
  });
});

describe("wallet URL validation", () => {
  it("accepts OpenID4VP, Age Verification, and HTTPS request URLs", () => {
    expect(validateWalletRequestUrl("openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Fr"))
      .toContain("openid4vp://");
    expect(validateWalletRequestUrl("https://wallet.example/request")).toBe("https://wallet.example/request");
    expect(validateWalletRequestUrl("av://?request_uri=https%3A%2F%2Fwallet.example%2Fr"))
      .toBe("av://?request_uri=https%3A%2F%2Fwallet.example%2Fr");
  });

  it.each([
    null,
    2,
    "",
    "   ",
    "javascript:alert(1)",
    "http://wallet.example/request",
    "openid4vp://wallet.example/a b",
    "av://wallet.example/a b",
    "arbitrary-wallet://authorize",
    "https://",
  ])("rejects an unsafe or malformed wallet URL (%j)", (value) => {
    expect(() => validateWalletRequestUrl(value)).toThrow(AgeCheckProtocolError);
  });
});

describe("session response validation", () => {
  it("accepts only a session id and supported wallet request URL", () => {
    expect(parseCreateSessionResponse({
      session_id: "session-1",
      qr_code_url: "openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Fr",
      private_claims: { birth_date: "2000-01-01" },
    })).toEqual({
      session_id: "session-1",
      qr_code_url: "openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Fr",
    });
  });

  it("accepts a valid expiration and rejects malformed values", () => {
    const base = { session_id: "s1", qr_code_url: "https://wallet.example/request" };
    expect(parseCreateSessionResponse({ ...base, expires_at: "2026-10-08T12:00:00Z" }))
      .toEqual({ ...base, expires_at: "2026-10-08T12:00:00Z" });
    expect(() => parseCreateSessionResponse({ ...base, expires_at: "not-a-date" }))
      .toThrow("session expiration is invalid");
  });

  it.each([null, [], "session"])("rejects non-object session responses (%j)", (value) => {
    expect(() => parseCreateSessionResponse(value)).toThrow("session response is invalid");
  });

  it.each([undefined, "", "  ", "x".repeat(257)])("rejects invalid session ids (%j)", (session_id) => {
    expect(() => parseCreateSessionResponse({
      session_id,
      qr_code_url: "https://wallet.example/request",
    })).toThrow("session identifier is invalid");
  });

  it("rejects a missing or unsafe request URL", () => {
    expect(() => parseCreateSessionResponse({ session_id: "s1" })).toThrow("wallet request URL is invalid");
  });

  it("normalizes pending states and verified boolean outcomes", () => {
    expect(parseAgeCheckSessionResponse({ status: "CREATED" })).toEqual({ status: "PENDING" });
    expect(parseAgeCheckSessionResponse({ status: "pending" })).toEqual({ status: "PENDING" });
    expect(parseAgeCheckSessionResponse({ status: "verified", age_over_18: true }))
      .toEqual({ status: "VERIFIED", age_over_18: true });
    expect(parseAgeCheckSessionResponse({ status: "VERIFIED", age_over_18: false }))
      .toEqual({ status: "VERIFIED", age_over_18: false });
    expect(parseAgeCheckSessionResponse({ status: "failed" })).toEqual({ status: "FAILED" });
    expect(parseAgeCheckSessionResponse({ status: "EXPIRED" })).toEqual({ status: "EXPIRED" });
  });

  it.each([
    null,
    {},
    { status: 7 },
    { status: "VERIFIED" },
    { status: "VERIFIED", age_over_18: "true" },
    { status: "CANCELED" },
  ])("rejects invalid status responses (%j)", (value) => {
    expect(() => parseAgeCheckSessionResponse(value)).toThrow(AgeCheckProtocolError);
  });
});
