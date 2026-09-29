# @dlbr/eid-age-check

A framework-neutral age-check button for websites. It is a Web Component that
starts a check through your server, presents an EUDI Wallet request as a QR code
and wallet link, and emits a boolean age result.

The API key stays on your server. The browser calls only your same-origin
endpoints and receives the wallet request URL and the <code>age_over_18</code>
result.

**Scope:** EUDI Proof of Age mdoc with the <code>age_over_18</code> claim. A
compatible wallet and an issuer trusted by your DLBR tenant are required.

## Install

~~~~sh
pnpm add @dlbr/eid-age-check
~~~~

## Plain JavaScript

~~~~html
<dlbr-age-check endpoint="/api/age-check"></dlbr-age-check>

<script type="module">
  import { registerAgeCheckElement } from "@dlbr/eid-age-check";

  registerAgeCheckElement();

  document.querySelector("dlbr-age-check").addEventListener("age-verified", () => {
    document.querySelector("#restricted-content").hidden = false;
  });
</script>
~~~~

The endpoint attribute points to merchant-owned routes:

- <code>POST /api/age-check/sessions</code> creates a Gateway session and
  returns <code>{ "session_id": "...", "qr_code_url": "openid4vp://..." }</code>.
- <code>GET /api/age-check/sessions/{session_id}</code> returns
  <code>{ "status": "PENDING" }</code>, <code>{ "status": "FAILED" }</code>,
  <code>{ "status": "EXPIRED" }</code>, or
  <code>{ "status": "VERIFIED", "age_over_18": true }</code>.

A verified response must contain a boolean. <code>false</code> emits
<code>age-not-verified</code>, never <code>age-verified</code>.
<code>CREATED</code> is treated as <code>PENDING</code>.

## Framework integrations

The same custom element works with Vue, Next.js, Nuxt, Astro, and Svelte. The
framework code only registers the element and listens for its events. These
framework examples are also available as package subpaths:

- `@dlbr/eid-age-check/vue`
- `@dlbr/eid-age-check/svelte`
- `@dlbr/eid-age-check/react` or `@dlbr/eid-age-check/nextjs`
- `@dlbr/eid-age-check/astro`
- `@dlbr/eid-age-check/nuxt` (Nuxt module)
- `@dlbr/eid-age-check/nuxt/plugin` (manual Nuxt client plugin)

For example, import the Vue component with
`import AgeCheck from "@dlbr/eid-age-check/vue"`. These subpaths point to the
framework source files included in the package, so the consuming app needs its
usual Vue, Svelte, React/Next.js, Astro, or Nuxt compiler/plugin configured.

- [Vue](./examples/vue/AgeCheck.vue)
- [Next.js](./examples/nextjs/AgeCheck.tsx)
- [Nuxt module](./examples/nuxt/README.md)
- [Astro](./examples/astro/AgeCheck.astro)
- [Svelte](./examples/svelte/AgeCheck.svelte)
- [Plain JavaScript](./examples/plain-javascript/index.html)

Next.js and Nuxt render the element on the client. Their server routes call the
DLBR SDK and protect the API key. The Nuxt module below registers both sides
for you.

### Nuxt module

Install `@dlbr/eid-age-check` and add its module to `nuxt.config.ts`:

~~~~ts
export default defineNuxtConfig({
  modules: ["@dlbr/eid-age-check/nuxt"],
});
~~~~

Set these server-only runtime environment variables:

- `NUXT_DLBR_AGE_CHECK_API_KEY`: active DLBR Gateway API key.
- `NUXT_DLBR_AGE_CHECK_ISSUER_ID`: trusted Proof of Age issuer ID.
- `NUXT_DLBR_AGE_CHECK_COOKIE_SECRET`: random secret of at least 32 bytes.

Then use the widget without wiring its endpoint or registering the custom
element yourself:

~~~~vue
<template>
  <dlbr-age-check @age-verified="ageVerified = true" />
  <section v-if="ageVerified">Age verified. Apply your own access rules.</section>
</template>

<script setup lang="ts">
const ageVerified = ref(false);
</script>
~~~~

The module registers a client-only custom-element plugin and same-origin
server handlers at `/api/dlbr/age-check/sessions` and
`/api/dlbr/age-check/sessions/:sessionId`. It binds the Gateway session to the
browser that created it with a signed, `HttpOnly`, `SameSite=Strict` cookie.
The API key and cookie secret stay in private Nuxt runtime config. Configure
the values through runtime environment variables; do not put secrets in module
options or `runtimeConfig.public`. See [the complete Nuxt setup](./examples/nuxt/README.md)
for custom endpoints, Gateway origins, and deployment notes.

For a plain JavaScript frontend with a Cloudflare Worker API and D1-backed
session binding, see the [Cloudflare Workers demo](./examples/cloudflare-worker/README.md).

## Server contract and age request

Use <code>@dlbr/eid-sdk</code> in your server routes to create and retrieve
Gateway sessions. See
[examples/server/age-check-session.ts](./examples/server/age-check-session.ts)
for the minimum-disclosure age request and result mapping.

The server should:

1. Create an OID4VP session for the trusted <code>eu.europa.ec.av.1</code>
   Proof of Age issuer, requesting only <code>age_over_18</code>.
2. Keep the Gateway API key and session lookup on the server.
3. Bind the Gateway session ID to the current site session or another
   server-controlled opaque handle. Do not let a browser choose arbitrary
   Gateway session IDs to retrieve.
4. Return the <code>qr_code_url</code> to the browser, then map the verified
   claim to the small response contract above. Do not return raw credential
   claims.
5. Apply your site's own age-gated access decision after the event.

Protect the browser routes from cross-site requests as appropriate for your
application. The widget rejects cross-origin endpoint URLs and sends
same-origin credentials.

## Events

~~~~js
element.addEventListener("age-verified", (event) => {
  // event.detail.age_over_18 === true
});

element.addEventListener("age-not-verified", () => {
  // A verified wallet presentation returned false.
});

element.addEventListener("age-verification-failed", () => {
  // The verifier rejected the presentation.
});

element.addEventListener("age-verification-expired", () => {
  // The wallet request expired.
});

element.addEventListener("age-verification-error", () => {
  // A network error or invalid merchant endpoint response occurred.
});
~~~~

Events bubble across the Shadow DOM boundary. They expose only a boolean or
terminal status, never a birth date or raw credential claims.

## Customization

The component uses Shadow DOM. Override its CSS custom properties:

~~~~css
dlbr-age-check {
  --dlbr-age-check-primary: #14532d;
  --dlbr-age-check-on-primary: #ffffff;
  --dlbr-age-check-focus: #a3e635;
  --dlbr-age-check-border: #cbd5e1;
  --dlbr-age-check-background: #ffffff;
  --dlbr-age-check-text: #172033;
  --dlbr-age-check-muted: #475569;
  --dlbr-age-check-link: #14532d;
  --dlbr-age-check-error: #a12622;
}
~~~~

Set <code>poll-interval</code> in milliseconds to adjust the status interval.
Values from 250 to 30,000 are accepted; other values use the 2,000 ms default.

## Development and verification

~~~~sh
pnpm install
pnpm validate
~~~~

Validation builds the ESM and no-bundler IIFE entrypoints, runs unit tests with
90% minimum statement, branch, function, and line coverage, then runs Playwright
browser tests against a mocked merchant endpoint. E2E tests do not call a live
Gateway or a real wallet.

## Limitations

This component is a user interface and session client. It does not issue age
credentials, establish issuer trust, decide whether a site is legally allowed
to offer age-restricted content, or replace application authorization logic.
Wallet and credential availability varies by market. Provide an appropriate
alternative when a user cannot complete the wallet flow.

## License

MIT. See [LICENSE](./LICENSE).
