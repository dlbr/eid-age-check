import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgeCheckElement } from "../src/age-check-element.js";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,e2e"),
}));

import { toDataURL } from "qrcode";

let customTagCounter = 0;
type MockResponse = { ok: boolean; json: () => Promise<unknown> };

function response(body: unknown, ok = true): MockResponse {
  return { ok, json: async () => body };
}

function mountWidget(endpoint = "/api/age-check", attributes: Record<string, string> = {}): HTMLElement {
  customTagCounter += 1;
  const tagName = "dlbr-age-check-test-" + customTagCounter;
  registerAgeCheckElement(tagName);
  const widget = document.createElement(tagName);
  widget.setAttribute("endpoint", endpoint);
  for (const [name, value] of Object.entries(attributes)) widget.setAttribute(name, value);
  document.body.append(widget);
  return widget;
}

function shadow(widget: HTMLElement): ShadowRoot {
  if (!widget.shadowRoot) throw new Error("Widget shadow root was not created");
  return widget.shadowRoot;
}

function clickButton(widget: HTMLElement): void {
  const button = shadow(widget).querySelector<HTMLButtonElement>("button");
  if (!button) throw new Error("Widget button was not rendered");
  button.click();
}

async function waitForState(widget: HTMLElement, state: string): Promise<void> {
  await vi.waitFor(() => expect(widget.getAttribute("data-state")).toBe(state));
}

describe("age-check custom element", () => {
  beforeEach(() => {
    document.head.innerHTML = '<base href="https://shop.example/checkout">';
    document.body.innerHTML = "";
    vi.mocked(toDataURL).mockReset();
    vi.mocked(toDataURL).mockResolvedValue("data:image/png;base64,e2e");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("registers once and rejects malformed custom-element names", () => {
    const tagName = "dlbr-age-check-registration-" + (++customTagCounter);
    expect(registerAgeCheckElement(tagName)).toBe(true);
    expect(registerAgeCheckElement(tagName)).toBe(false);
    expect(registerAgeCheckElement("missinghyphen" + customTagCounter)).toBe(false);
    expect(registerAgeCheckElement("dlbr-age-check-unavailable", null)).toBe(false);
  });

  it("shows a pending wallet request with both QR and deep link", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({
        session_id: "session-1",
        qr_code_url: "openid4vp://authorize?request_uri=https%3A%2F%2Fwallet.example%2Fr",
      }) as Response)
      .mockResolvedValueOnce(response({ status: "PENDING" }) as Response);

    const widget = mountWidget();
    expect(shadow(widget).querySelector("h2")?.textContent).toBe("Age verification");
    clickButton(widget);
    await waitForState(widget, "pending");

    expect(shadow(widget).querySelector(".status")?.textContent).toContain("Scan the code");
    expect(shadow(widget).querySelector<HTMLImageElement>(".qr")?.src).toBe("data:image/png;base64,e2e");
    expect(shadow(widget).querySelector<HTMLAnchorElement>(".wallet-link")?.href).toContain("openid4vp://");
    expect(fetch).toHaveBeenNthCalledWith(1, new URL("https://shop.example/api/age-check/sessions"), expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
    }));
  });

  it("emits a minimal verified event for age_over_18 true", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-true", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "VERIFIED", age_over_18: true }) as Response);

    const widget = mountWidget();
    const listener = vi.fn();
    widget.addEventListener("age-verified", listener);
    clickButton(widget);
    await waitForState(widget, "verified");

    expect(shadow(widget).querySelector(".status")?.textContent).toBe("Age verified.");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ detail: { age_over_18: true }, bubbles: true, composed: true });
  });

  it("lets a merchant reveal restricted content only after age is verified", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-access", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "VERIFIED", age_over_18: true }) as Response);

    const restrictedContent = document.createElement("section");
    restrictedContent.hidden = true;
    document.body.append(restrictedContent);

    const widget = mountWidget();
    widget.addEventListener("age-verified", () => {
      restrictedContent.hidden = false;
    });
    clickButton(widget);

    await waitForState(widget, "verified");
    expect(restrictedContent.hidden).toBe(false);
  });

  it("distinguishes a verified under-18 result from a successful age check", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-false", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "VERIFIED", age_over_18: false }) as Response);

    const widget = mountWidget();
    const listener = vi.fn();
    widget.addEventListener("age-not-verified", listener);
    clickButton(widget);
    await waitForState(widget, "denied");

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({ detail: { age_over_18: false } });
    expect(shadow(widget).querySelector(".button")?.textContent).toBe("Try age verification again");
  });

  it.each([
    ["FAILED", "failed", "age-verification-failed"],
    ["EXPIRED", "expired", "age-verification-expired"],
  ])("renders a terminal %s state and emits its event", async (status, state, eventName) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-terminal", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status }) as Response);

    const widget = mountWidget();
    const listener = vi.fn();
    widget.addEventListener(eventName, listener);
    clickButton(widget);
    await waitForState(widget, state);

    expect(listener).toHaveBeenCalledOnce();
    expect(shadow(widget).querySelector(".status")?.classList.contains("error")).toBe(true);
  });

  it("recovers when QR rendering fails and preserves the wallet link", async () => {
    vi.mocked(toDataURL).mockRejectedValueOnce(new Error("canvas unavailable"));
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-qr", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "PENDING" }) as Response);

    const widget = mountWidget();
    clickButton(widget);
    await waitForState(widget, "pending");

    expect(shadow(widget).querySelector<HTMLImageElement>(".qr")?.hidden).toBe(true);
    expect(shadow(widget).querySelector<HTMLAnchorElement>(".wallet-link")?.href).toBe("https://wallet.example/request");
  });

  it("shows a recoverable error when session creation fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({}, false) as Response);
    const widget = mountWidget();
    const listener = vi.fn();
    widget.addEventListener("age-verification-error", listener);
    clickButton(widget);
    await waitForState(widget, "error");

    expect(listener).toHaveBeenCalledOnce();
    expect(shadow(widget).querySelector<HTMLButtonElement>(".button")?.disabled).toBe(false);
    expect(shadow(widget).querySelector(".status")?.textContent).toContain("temporarily unavailable");
  });

  it("shows a recoverable error when status polling fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-status", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({}, false) as Response);

    const widget = mountWidget();
    clickButton(widget);
    await waitForState(widget, "error");
  });

  it("rejects a cross-origin endpoint before making a request", async () => {
    const widget = mountWidget("https://attacker.example/api");
    clickButton(widget);
    await waitForState(widget, "error");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries polling while pending and honors a bounded poll interval", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-poll", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "PENDING" }) as Response)
      .mockResolvedValueOnce(response({ status: "VERIFIED", age_over_18: true }) as Response);

    const widget = mountWidget("/api/age-check", { "poll-interval": "250" });
    clickButton(widget);
    await vi.waitFor(() => expect(widget.getAttribute("data-state")).toBe("pending"));
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(widget.getAttribute("data-state")).toBe("verified"));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to the default interval when the attribute is out of range", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-range", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "PENDING" }) as Response)
      .mockResolvedValueOnce(response({ status: "EXPIRED" }) as Response);

    const widget = mountWidget("/api/age-check", { "poll-interval": "10" });
    clickButton(widget);
    await vi.advanceTimersByTimeAsync(0);
    expect(widget.getAttribute("data-state")).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(widget.getAttribute("data-state")).toBe("expired"));
  });

  it("stops polling and resets when removed then connected again", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ session_id: "s-disconnect", qr_code_url: "https://wallet.example/request" }) as Response)
      .mockResolvedValueOnce(response({ status: "PENDING" }) as Response);

    const widget = mountWidget();
    clickButton(widget);
    await vi.waitFor(() => expect(widget.getAttribute("data-state")).toBe("pending"));
    widget.remove();
    document.body.append(widget);
    expect(widget.getAttribute("data-state")).toBe("idle");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
