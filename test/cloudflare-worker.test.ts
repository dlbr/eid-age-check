import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The plain-JavaScript Worker is a deployable example without TypeScript declarations.
// @ts-expect-error importing the JavaScript Worker for behavioral tests
import worker from "../examples/cloudflare-worker/worker.js";

function env() {
  const run = vi.fn().mockResolvedValue({});
  const bind = vi.fn().mockReturnValue({ run });
  return {
    DLBR_EID_BASE_URL: "https://gateway.example",
    DLBR_EID_API_KEY: "test-key",
    DLBR_EID_AGE_ISSUER_ID: "https://issuer.example",
    DLBR_EID_INTENDED_USE_ID: "test-use",
    CREATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    SESSIONS: { prepare: vi.fn().mockReturnValue({ bind }) },
  };
}

function request(contentLength?: string): Request {
  const headers = new Headers({ Origin: "https://demo.example" });
  if (contentLength !== undefined) headers.set("Content-Length", contentLength);
  const emptyBody = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
  return {
    method: "POST",
    url: "https://demo.example/api/age-check/sessions",
    headers,
    body: emptyBody,
  } as Request;
}

describe("Cloudflare Worker session creation", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session_id: "session-1",
      qr_code_url: "openid4vp://request",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }), { status: 201, headers: { "Content-Type": "application/json" } })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts an empty POST stream even when body is non-null", async () => {
    const bindings = env();
    const response = await worker.fetch(request(), bindings);
    expect(response.status).toBe(201);
    expect(fetch).toHaveBeenCalledOnce();
    expect(bindings.CREATE_LIMITER.limit).toHaveBeenCalledOnce();
  });

  it("rejects a declared non-empty body before calling the Gateway", async () => {
    const response = await worker.fetch(request("1"), env());
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});
