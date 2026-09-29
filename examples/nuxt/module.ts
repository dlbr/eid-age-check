import { addPlugin, addServerHandler, addTypeTemplate, createResolver, defineNuxtModule } from "@nuxt/kit";

export interface DlbrAgeCheckNuxtOptions {
  /** Same-origin API prefix used by the widget and generated server handlers. */
  endpoint?: string;
  /** Trusted Proof of Age issuer configured for the Gateway tenant. */
  issuerId?: string;
  /** Optional Gateway origin. Defaults to the SDK's production origin. */
  baseUrl?: string;
  /** Name of the signed, HttpOnly cookie that binds a browser to its Gateway session. */
  cookieName?: string;
  /** Gateway session binding lifetime, from 60 to 3600 seconds. */
  sessionTtlSeconds?: number;
}

function normalizeEndpoint(value: string): string {
  const endpoint = value.replace(/\/+$/, "");
  if (!/^\/api(?:\/[A-Za-z0-9_-]+)+$/.test(endpoint)) {
    throw new Error("dlbrAgeCheck.endpoint must be a same-origin /api path without a query or fragment");
  }
  return endpoint;
}

export default defineNuxtModule<DlbrAgeCheckNuxtOptions>({
  meta: {
    name: "@dlbr/eid-age-check",
    configKey: "dlbrAgeCheck",
    compatibility: { nuxt: ">=3.0.0" },
  },
  defaults: {
    endpoint: "/api/dlbr/age-check",
    issuerId: "",
    baseUrl: "https://api.dlbr.app",
    cookieName: "dlbr_age_check",
    sessionTtlSeconds: 900,
  },
  setup(options, nuxt) {
    const endpoint = normalizeEndpoint(options.endpoint!);
    if (!Number.isInteger(options.sessionTtlSeconds) || options.sessionTtlSeconds! < 60 || options.sessionTtlSeconds! > 3600) {
      throw new Error("dlbrAgeCheck.sessionTtlSeconds must be an integer from 60 through 3600");
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.cookieName!)) {
      throw new Error("dlbrAgeCheck.cookieName must contain 1 to 64 letters, digits, underscores, or hyphens");
    }

    const runtimeConfig = nuxt.options.runtimeConfig as Record<string, any>;
    const privateConfig = runtimeConfig.dlbrAgeCheck ?? {};
    runtimeConfig.dlbrAgeCheck = {
      apiKey: "",
      cookieSecret: "",
      issuerId: options.issuerId,
      baseUrl: options.baseUrl || "https://api.dlbr.app",
      cookieName: options.cookieName,
      sessionTtlSeconds: options.sessionTtlSeconds,
      ...privateConfig,
    };
    runtimeConfig.public ??= {};
    runtimeConfig.public.dlbrAgeCheck = {
      ...(runtimeConfig.public.dlbrAgeCheck ?? {}),
      endpoint,
    };
    addTypeTemplate({
      filename: "types/dlbr-age-check.d.ts",
      getContents: () => `declare module "@nuxt/schema" {
  interface RuntimeConfig {
    dlbrAgeCheck: {
      apiKey: string;
      cookieSecret: string;
      issuerId: string;
      baseUrl: string;
      cookieName: string;
      sessionTtlSeconds: number;
    };
  }
  interface PublicRuntimeConfig {
    dlbrAgeCheck: { endpoint: string };
  }
}
export {};`,
    }, { nuxt: true, nitro: true });

    nuxt.options.vue.compilerOptions ??= {};
    const previousIsCustomElement = nuxt.options.vue.compilerOptions.isCustomElement;
    nuxt.options.vue.compilerOptions.isCustomElement = (tag: string) =>
      tag === "dlbr-age-check" || previousIsCustomElement?.(tag) === true;

    const resolver = createResolver(import.meta.url);
    addPlugin({ src: resolver.resolve("./runtime/plugin.client"), mode: "client" });
    addServerHandler({
      route: `${endpoint}/sessions`,
      method: "POST",
      handler: resolver.resolve("./runtime/server/session.post"),
    });
    addServerHandler({
      route: `${endpoint}/sessions/:sessionId`,
      method: "GET",
      handler: resolver.resolve("./runtime/server/session.get"),
    });
  },
});
