# Nuxt module

The Nuxt module registers the browser custom element and adds the server routes
the widget calls. The Gateway API key stays in private runtime config; the
browser only receives the wallet request URL and the boolean `age_over_18`
result.

## Install and configure

Install the package and add its module in `nuxt.config.ts`:

```sh
pnpm add @dlbr/eid-age-check
```

```ts
export default defineNuxtConfig({
  modules: ["@dlbr/eid-age-check/nuxt"],
});
```

Set these runtime environment variables on the Nuxt server:

```dotenv
NUXT_DLBR_AGE_CHECK_API_KEY=sk_test_your_test_key
NUXT_DLBR_AGE_CHECK_ISSUER_ID=your_trusted_proof_of_age_issuer
NUXT_DLBR_AGE_CHECK_COOKIE_SECRET=replace_with_at_least_32_random_bytes
```

Generate a cookie secret with `openssl rand -base64 32`. Do not put the API key
or cookie secret in `runtimeConfig.public`, page data, or module options.

## Use the widget

The module registers `<dlbr-age-check>` as a Vue custom element and defaults
its endpoint to `/api/dlbr/age-check`:

```vue
<template>
  <dlbr-age-check @age-verified="ageVerified = true" />
  <section v-if="ageVerified">Age verified. Apply your own access rules.</section>
</template>

<script setup lang="ts">
const ageVerified = ref(false);
</script>
```

The generated handlers are:

- `POST /api/dlbr/age-check/sessions`
- `GET /api/dlbr/age-check/sessions/:sessionId`

The POST creates a Gateway session requesting only the `age_over_18` claim.
The GET maps Gateway state to the widget's small status contract. Each created
session gets a signed, `HttpOnly`, `SameSite=Strict` cookie scoped to the API
path. The cookie binds the browser to that opaque Gateway session ID, so a
caller cannot substitute another session ID. Separate checks get separate
cookies, and terminal results clear their cookie.

## Options

```ts
export default defineNuxtConfig({
  modules: [["@dlbr/eid-age-check/nuxt", {
    endpoint: "/api/dlbr/age-check",
    issuerId: "your_trusted_proof_of_age_issuer",
    baseUrl: "https://api.dlbr.app",
    cookieName: "dlbr_age_check",
    sessionTtlSeconds: 900,
  }]],
});
```

`endpoint` must be a same-origin path below `/api`. The module registers its
routes below that path and configures the custom element to call it. Set
`baseUrl` only when using a non-default Gateway origin. The issuer may instead
be set through `NUXT_DLBR_AGE_CHECK_ISSUER_ID`. The session cookie lifetime must
be between 60 and 3600 seconds.

`@dlbr/eid-age-check/nuxt/plugin` remains available for apps that only want
manual client-side element registration and provide their own server routes.
