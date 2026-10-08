# Plain JavaScript Cloudflare Worker demo

This demo serves the plain JavaScript age-check page as a Workers Static Asset
and handles the age-check API in a module Worker. D1 stores the Gateway session
ID and a hash of an opaque browser cookie so a different browser cannot poll the
session. The API key stays in Worker secrets. Static asset security and cache
headers are configured in `public/_headers`; API responses receive their headers
from the Worker.

## Configure

From the repository root, install the package dependencies, then install the
demo's own Worker dependencies:

```sh
pnpm install
cd examples/cloudflare-worker
pnpm install
```

Create a D1 database and copy its ID into `wrangler.jsonc` in place of the
all-zero placeholder:

```sh
pnpm exec wrangler d1 create eid-age-check-demo
```

The Worker uses the DLBR API and the EU Age Verification reference issuer,
`https://issuer.ageverification.dev`. The generic EUDI reference issuer at
`https://issuer.eudiw.dev` provides PID/mDL credentials by default, not the
Proof of Age credential requested here. The AV reference issuer supports the
`mso_mdoc` Proof of Age credential with document type and namespace
`eu.europa.ec.av.1`.

Before testing, issue and store that Proof of Age credential in a compatible Age
Verification wallet. The relying-party policy must allow
`https://issuer.ageverification.dev`, `mso_mdoc`, `eu.europa.ec.av.1`, and only
the requested `age_over_18` claim for this issuer. It must also register the
demo origin `https://demo.dlbr.app`. Keep the existing registered
`intendedUseIdentifier` and set `DLBR_EID_INTENDED_USE_ID` to it. A PID or mDL
credential from the generic EUDI issuer will not satisfy this request.

For local development, copy `.dev.vars.example` to `.dev.vars`, then enter a
test API key for the same relying party and its intended-use identifier. Apply
the schema to the local D1 database:

```sh
cp .dev.vars.example .dev.vars
pnpm exec wrangler d1 migrations apply eid-age-check-demo --local
```

## Run and deploy

```sh
pnpm run dev
```

For a remote deployment, set up the GitHub Actions values described below. The
workflow applies the D1 migration, deploys the Worker, and publishes the
Gateway API key as a Worker secret:

```sh
pnpm exec wrangler d1 migrations apply eid-age-check-demo --remote
pnpm run deploy
```

## CI/CD deployment

`.github/workflows/deploy-cloudflare-worker.yml` runs the package coverage gate
(90% minimum in statements, branches, functions, and lines) and demo build on
pull requests. It deploys to `demo.dlbr.app` from `main` after those checks
pass. Configure these GitHub repository settings:

- Secret `CLOUDFLARE_API_TOKEN`: a token with Workers Scripts, D1, and DNS edit
  permissions for the `dlbr.app` zone.
- Secret `DLBR_EID_API_KEY`: a test-mode Gateway key. CI stores it in the Worker
  secret store; it is never written to `wrangler.jsonc` or the repository.
- Variable `DLBR_EID_INTENDED_USE_ID`: the exact registered intended-use
  identifier for the Proof of Age request.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account that owns `dlbr.app`.
- Variable `D1_DATABASE_ID`: the UUID returned by `wrangler d1 create` for the
  demo database.

Create the D1 database once, set its ID as the GitHub Actions variable, and
apply the migration remotely before deploying:

```sh
pnpm exec wrangler d1 create eid-age-check-demo
pnpm exec wrangler d1 migrations apply eid-age-check-demo --remote
```

The workflow applies the migration on each deployment, so the migration
command above is needed only when deploying manually.

The demo requests only `age_over_18`. A verified result reveals the sample
restricted-content section; the application must enforce its own access rules.
