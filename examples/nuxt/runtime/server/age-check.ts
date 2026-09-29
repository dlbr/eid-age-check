import { DlbrId } from "@dlbr/eid-sdk";
import { createError, getHeader, getRequestURL, type H3Event } from "h3";
import { useRuntimeConfig } from "#imports";

export interface AgeCheckRuntimeConfig {
  apiKey: string;
  issuerId: string;
  baseUrl?: string;
  cookieName: string;
  sessionTtlSeconds: number;
}

export function getAgeCheckRuntimeConfig(event: H3Event): AgeCheckRuntimeConfig & { cookieSecret: string } {
  const config = useRuntimeConfig(event).dlbrAgeCheck as Partial<AgeCheckRuntimeConfig> & { cookieSecret?: string };
  if (!config.apiKey || !config.issuerId || !config.cookieSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: "Age-check server configuration is incomplete",
    });
  }
  if (new TextEncoder().encode(config.cookieSecret).byteLength < 32) {
    throw createError({ statusCode: 500, statusMessage: "Age-check cookie secret must be at least 32 bytes" });
  }
  return config as AgeCheckRuntimeConfig & { cookieSecret: string };
}

export function createAgeCheckClient(config: AgeCheckRuntimeConfig): DlbrId {
  return new DlbrId({
    baseUrl: config.baseUrl || "https://api.dlbr.app",
    apiKey: config.apiKey,
  });
}

export function assertSameOrigin(event: H3Event): void {
  const origin = getHeader(event, "origin");
  if (!origin) return;
  let matches = false;
  try {
    matches = new URL(origin).origin === getRequestURL(event).origin;
  } catch {
    matches = false;
  }
  if (!matches) {
    throw createError({ statusCode: 403, statusMessage: "Cross-origin age-check requests are not allowed" });
  }
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
