import { toDataURL } from "qrcode";
import {
  createSessionUrl,
  createStatusUrl,
  parseAgeCheckSessionResponse,
  parseCreateSessionResponse,
  type AgeCheckSessionResponse,
} from "./protocol.js";

type ViewState = "idle" | "starting" | "pending" | "verified" | "denied" | "failed" | "expired" | "error";

const defaultTagName = "dlbr-age-check";
const defaultPollInterval = 2_000;

const template = [
  "<style>",
  ":host{display:block;color:var(--dlbr-age-check-text,#172033);font:inherit}",
  ".card{box-sizing:border-box;max-width:28rem;padding:1.25rem;border:1px solid var(--dlbr-age-check-border,#cbd5e1);border-radius:1rem;background:var(--dlbr-age-check-background,#fff)}",
  ".title{margin:0 0 .5rem;font-size:1.125rem;font-weight:700}",
  ".description{margin:0 0 1rem;line-height:1.5;color:var(--dlbr-age-check-muted,#475569)}",
  ".button{min-height:2.75rem;padding:.75rem 1rem;border:0;border-radius:.6rem;background:var(--dlbr-age-check-primary,#172033);color:var(--dlbr-age-check-on-primary,#fff);font:inherit;font-weight:650;cursor:pointer}",
  ".button:focus-visible,.wallet-link:focus-visible{outline:3px solid var(--dlbr-age-check-focus,#75d64b);outline-offset:3px}",
  ".reset-button:focus-visible{outline:3px solid var(--dlbr-age-check-focus,#75d64b);outline-offset:3px}",
  ".button:disabled{cursor:wait;opacity:.72}",
  ".status{min-height:1.5rem;margin:.75rem 0 0;line-height:1.5}",
  ".request{display:grid;justify-items:start;gap:.75rem;margin-top:1rem}",
  ".qr{display:block;width:min(15rem,100%);height:auto;border:1px solid #e2e8f0;border-radius:.5rem;background:#fff}",
  ".wallet-link{color:var(--dlbr-age-check-link,#176b45);font-weight:650}",
  ".countdown{margin:0;color:var(--dlbr-age-check-muted,#475569);font-variant-numeric:tabular-nums}",
  ".reset-button{padding:.35rem 0;border:0;background:transparent;color:var(--dlbr-age-check-link,#176b45);font:inherit;font-weight:650;text-decoration:underline;cursor:pointer}",
  ".error{color:var(--dlbr-age-check-error,#a12622)}",
  "[hidden]{display:none!important}",
  "</style>",
  "<section class=\"card\" part=\"card\">",
  "<h2 class=\"title\" part=\"title\">Age verification</h2>",
  "<p class=\"description\">Confirm that you are over 18 using a supported digital identity wallet.</p>",
  "<button class=\"button\" part=\"button\" type=\"button\">Verify age with your wallet</button>",
  "<p class=\"status\" part=\"status\" role=\"status\" aria-live=\"polite\"></p>",
  "<div class=\"request\" part=\"request\" hidden>",
  "<img class=\"qr\" part=\"qr\" alt=\"Scan this wallet request with your digital identity wallet\" hidden>",
  "<a class=\"wallet-link\" part=\"wallet-link\">Open in wallet</a>",
  "<p class=\"countdown\" part=\"countdown\" hidden></p>",
  "<button class=\"reset-button\" part=\"reset-button\" type=\"button\">Reset session</button>",
  "</div>",
  "</section>",
].join("");

const stateMessages: Record<ViewState, string> = {
  idle: "",
  starting: "Preparing a secure request…",
  pending: "Scan the code or open the wallet to continue.",
  verified: "Age verified.",
  denied: "Age not verified.",
  failed: "We could not verify your age. Please try again.",
  expired: "This request expired. Please start again.",
  error: "Age verification is temporarily unavailable. Please try again.",
};

const buttonLabels: Record<ViewState, string> = {
  idle: "Verify age with your wallet",
  starting: "Preparing request…",
  pending: "Waiting for your wallet…",
  verified: "Age verified",
  denied: "Try age verification again",
  failed: "Try age verification again",
  expired: "Try age verification again",
  error: "Try age verification again",
};

const publicErrorCodes = new Set([
  "ISSUER_NOT_ALLOWED",
  "INTENDED_USE_NOT_ACTIVE",
  "DEMO_CONFIGURATION_ERROR",
  "GATEWAY_UNAVAILABLE",
]);

function isBusy(state: ViewState): boolean {
  return state === "starting" || state === "pending" || state === "verified";
}

/** Creates a browser custom element that drives the merchant-owned age-check endpoints. */
export function createAgeCheckElementClass(defaultEndpoint = ""): CustomElementConstructor {
  return class DlbrAgeCheckElement extends HTMLElement {
    private state: ViewState = "idle";
    private polling = false;
    private pollTimer: number | undefined;
    private countdownTimer: number | undefined;
    private expiresAt: number | undefined;
    private generation = 0;
    private abortController: AbortController | undefined;
    private statusUrl = "";
    private walletUrl = "";
    private busy = false;

    connectedCallback(): void {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = template;
        root.querySelector<HTMLButtonElement>(".button")?.addEventListener("click", () => {
          void this.start();
        });
        root.querySelector<HTMLButtonElement>(".reset-button")?.addEventListener("click", () => {
          this.resetAndStart();
        });
      } else if (this.state === "pending" || this.state === "starting") {
        this.cancelActiveSession();
        this.setState("idle");
      }
      this.renderState();
    }

    disconnectedCallback(): void {
      this.cancelActiveSession();
    }

    private cancelActiveSession(): void {
      this.generation += 1;
      this.abortController?.abort();
      this.abortController = undefined;
      this.polling = false;
      this.busy = false;
      if (this.pollTimer !== undefined) {
        window.clearTimeout(this.pollTimer);
        this.pollTimer = undefined;
      }
      this.clearCountdownTimer();
      this.expiresAt = undefined;
      this.statusUrl = "";
      this.walletUrl = "";
      this.shadowRoot?.querySelector<HTMLImageElement>(".qr")?.removeAttribute("src");
    }

    private clearCountdownTimer(): void {
      if (this.countdownTimer !== undefined) {
        window.clearTimeout(this.countdownTimer);
        this.countdownTimer = undefined;
      }
    }

    private isCurrent(generation: number): boolean {
      return this.isConnected && generation === this.generation;
    }

    private resetAndStart(): void {
      if (this.state !== "pending") return;
      const oldStatusUrl = this.statusUrl;
      this.cancelActiveSession();
      this.setState("idle");
      if (oldStatusUrl) void fetch(oldStatusUrl, {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => undefined);
      void this.start();
    }

    private setState(state: ViewState): void {
      this.state = state;
      if (state !== "pending") this.clearCountdownTimer();
      this.setAttribute("data-state", state);
      this.renderState();
    }

    private renderState(): void {
      const root = this.shadowRoot;
      if (!root) return;
      const button = root.querySelector<HTMLButtonElement>(".button");
      const status = root.querySelector<HTMLParagraphElement>(".status");
      const request = root.querySelector<HTMLDivElement>(".request");
      const link = root.querySelector<HTMLAnchorElement>(".wallet-link");
      const image = root.querySelector<HTMLImageElement>(".qr");
      const countdown = root.querySelector<HTMLParagraphElement>(".countdown");
      if (!button || !status || !request || !link || !image || !countdown) return;

      button.textContent = buttonLabels[this.state];
      button.disabled = isBusy(this.state);
      status.textContent = stateMessages[this.state];
      status.classList.toggle("error", this.state === "failed" || this.state === "expired" || this.state === "error");
      request.hidden = this.state !== "pending";
      link.href = this.walletUrl;
      image.hidden = this.state !== "pending" || image.getAttribute("src") === null;
      countdown.hidden = this.state !== "pending" || this.expiresAt === undefined;
      if (!countdown.hidden && this.expiresAt !== undefined) {
        const seconds = Math.max(0, Math.ceil((this.expiresAt - Date.now()) / 1_000));
        countdown.textContent = `Time remaining: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      }
    }

    private tickCountdown(generation: number): void {
      if (!this.isCurrent(generation) || this.state !== "pending" || this.expiresAt === undefined) return;
      if (Date.now() >= this.expiresAt) {
        this.expireSession(generation);
        return;
      }
      this.renderState();
      this.countdownTimer = window.setTimeout(() => {
        this.countdownTimer = undefined;
        this.tickCountdown(generation);
      }, Math.min(1_000, this.expiresAt - Date.now()));
    }

    private expireSession(generation: number): void {
      if (!this.isCurrent(generation)) return;
      this.cancelActiveSession();
      this.setState("expired");
      this.dispatchAgeEvent("age-verification-expired", { status: "EXPIRED" });
    }

    private getPollInterval(): number {
      const raw = this.getAttribute("poll-interval");
      if (raw === null || raw.trim() === "") return defaultPollInterval;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 250 && value <= 30_000
        ? Math.floor(value)
        : defaultPollInterval;
    }

    private async start(): Promise<void> {
      if (this.busy || this.state === "verified") return;
      this.busy = true;
      this.setState("starting");
      let errorDetail: { code?: string; request_id?: string } = {};
      try {
        const endpoint = this.getAttribute("endpoint") ?? defaultEndpoint;
        const baseURI = document.baseURI;
        const response = await fetch(createSessionUrl(endpoint, baseURI), {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => undefined) as { code?: unknown; request_id?: unknown } | undefined;
          errorDetail = {
            ...(typeof body?.code === "string" && publicErrorCodes.has(body.code) ? { code: body.code } : {}),
            ...(typeof body?.request_id === "string" && /^req_[A-Za-z0-9_-]{1,128}$/.test(body.request_id)
              ? { request_id: body.request_id }
              : {}),
          };
          throw new Error("The merchant endpoint could not start an age check.");
        }
        const created = parseCreateSessionResponse(await response.json());
        this.walletUrl = created.qr_code_url;
        this.statusUrl = createStatusUrl(endpoint, created.session_id, baseURI).href;
        await this.renderWalletRequest(created.qr_code_url);
        if (!this.isConnected) return;
        this.polling = true;
        this.setState("pending");
        await this.poll();
      } catch {
        if (!this.isConnected) return;
        this.busy = false;
        this.polling = false;
        this.setState("error");
        this.dispatchAgeEvent("age-verification-error", { status: "ERROR", ...errorDetail });
      }
    }

    private async renderWalletRequest(walletUrl: string): Promise<void> {
      const root = this.shadowRoot;
      const link = root?.querySelector<HTMLAnchorElement>(".wallet-link");
      const image = root?.querySelector<HTMLImageElement>(".qr");
      if (!link || !image) return;
      link.href = walletUrl;
      image.hidden = true;
      image.removeAttribute("src");
      try {
        image.src = await toDataURL(walletUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 240,
          color: { dark: "#172033", light: "#ffffff" },
        });
        image.hidden = false;
      } catch {
        image.hidden = true;
      }
    }

    private async poll(): Promise<void> {
      if (!this.polling || !this.statusUrl || !this.isConnected) return;
      try {
        const response = await fetch(this.statusUrl, {
          method: "GET",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("The merchant status endpoint is unavailable.");
        const result: AgeCheckSessionResponse = parseAgeCheckSessionResponse(await response.json());
        if (!this.isConnected) return;
        if (result.status === "PENDING") {
          this.setState("pending");
          this.pollTimer = window.setTimeout(() => {
            this.pollTimer = undefined;
            void this.poll();
          }, this.getPollInterval());
          return;
        }

        this.polling = false;
        this.busy = false;
        if (result.status === "VERIFIED") {
          if (result.age_over_18) {
            this.setState("verified");
            this.dispatchAgeEvent("age-verified", { age_over_18: true });
          } else {
            this.setState("denied");
            this.dispatchAgeEvent("age-not-verified", { age_over_18: false });
          }
          return;
        }
        if (result.status === "EXPIRED") {
          this.setState("expired");
          this.dispatchAgeEvent("age-verification-expired", { status: "EXPIRED" });
          return;
        }
        this.setState(result.code === "ISSUER_TRUST_INVALID" ? "error" : "failed");
        this.dispatchAgeEvent("age-verification-failed", {
          status: "FAILED",
          ...(result.code ? { code: result.code } : {}),
          ...(result.request_id ? { request_id: result.request_id } : {}),
        });
      } catch {
        if (!this.isConnected) return;
        this.polling = false;
        this.busy = false;
        this.setState("error");
        this.dispatchAgeEvent("age-verification-error", { status: "ERROR" });
      }
    }

    private dispatchAgeEvent(name: string, detail: Record<string, boolean | string>): void {
      this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
    }
  };
}

/** Registers the framework-neutral custom element once in the current browser. */
export function registerAgeCheckElement(
  tagName = defaultTagName,
  registry: CustomElementRegistry | null = typeof customElements === "undefined" ? null : customElements,
  defaultEndpoint = "",
): boolean {
  const normalizedName = tagName.trim().toLowerCase();
  if (!registry || typeof HTMLElement === "undefined" || !normalizedName.includes("-")) return false;
  if (registry.get(normalizedName)) return false;
  registry.define(normalizedName, createAgeCheckElementClass(defaultEndpoint));
  return true;
}
