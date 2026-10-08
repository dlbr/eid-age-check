# Contributing

Thanks for helping improve @dlbr/eid-age-check.

## Setup

- Node.js 20 or newer
- pnpm 10

~~~~sh
pnpm install
pnpm validate
~~~~

## Changes

- Keep the browser package framework-neutral.
- Never put a DLBR API key in browser code or return raw credential claims.
- Add unit tests for protocol and component behavior.
- Keep unit coverage at or above the configured 90% thresholds.
- Add or update Vitest tests for protocol, component, and customer-flow changes.
- Update README examples when the endpoint contract or public API changes.
