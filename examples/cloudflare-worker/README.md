# Plain JavaScript Cloudflare Worker demo

This demo serves the plain JavaScript age-check page as a Workers Static Asset
and handles the age-check API in a module Worker. D1 stores the Gateway session
ID and a hash of an opaque browser cookie so a different browser cannot poll the
session. The API key stays in Worker secrets.

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

The Worker uses the DLBR production API base URL and EUDI reference Proof of Age
issuer by default; change those `vars` in `wrangler.jsonc` if needed. For local
development, copy `.dev.vars.example` to `.dev.vars` and enter a test API key.
Apply the schema to the local D1 database:

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

`.github/workflows/deploy-cloudflare-worker.yml` builds this demo on pull
requests and deploys it to `demo.dlbr.app` when code is pushed to `main` or the
workflow is started manually. Configure these GitHub repository settings:

- Secret `CLOUDFLARE_API_TOKEN`: a token with Workers Scripts, D1, and DNS edit
  permissions for the `dlbr.app` zone.
- Secret `DLBR_EID_API_KEY`: a test-mode Gateway key. CI stores it in the Worker
  secret store; it is never written to `wrangler.jsonc` or the repository.
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
