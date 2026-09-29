import type { NuxtModule } from "@nuxt/schema";

export interface DlbrAgeCheckNuxtOptions {
  endpoint?: string;
  issuerId?: string;
  baseUrl?: string;
  cookieName?: string;
  sessionTtlSeconds?: number;
}

declare const module: NuxtModule<DlbrAgeCheckNuxtOptions>;
export default module;
