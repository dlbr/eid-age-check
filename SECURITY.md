# Security policy

## Reporting a vulnerability

Please report suspected security issues privately through GitHub Security
Advisories for this repository. Include the affected version, impact, and
reproduction steps. Do not post credentials, wallet payloads, or personal data
in a public issue.

## Security properties

The browser package:

- rejects cross-origin endpoint URLs;
- accepts only HTTPS or OpenID4VP wallet request URLs;
- sends credentials only to same-origin merchant endpoints;
- expects the merchant server to reduce the Gateway result to a boolean;
- never receives a Gateway API key by design.

The consuming site remains responsible for API-key storage, endpoint
authentication, CSRF defenses, session binding, access decisions, and
appropriate fallback paths.
