# CBE-MOBILE-002 Provenance

Date: 2026-11-01
Issue: #498
Branch: `cbe-mobile-002-fastify-execution-adapter`
Production change: false

## Decision

Reuse the existing CoMind Fastify server as the provider-neutral execution adapter behind the CBE-MOBILE-001 phone-first control plane. Do not introduce another browser vendor or operator-facing dashboard.

## Implemented slice

- Added authenticated `POST /api/cbe-control` to the existing Fastify server.
- Added strict Development/Test request validation. Unknown fields, Production mutation, and implicit wake/recovery targets are rejected.
- Added a server-side bearer capability. Missing configuration returns unavailable; invalid authorization returns 401. The token is never emitted in responses or evidence.
- Added real `start_browser` and `stop_browser` lifecycle actions for a persistent Playwright Chromium context.
- Reused the CBE-AUTH profile-global single-writer lock. Browser launch cannot occur when another governed process owns the profile.
- The persistent profile must remain outside the repository.
- Start and stop are idempotent. Stop releases the profile lock even when cleanup fails.
- Added bounded `open_auth`, available only when an HTTPS human-authentication surface is explicitly configured.
- `retry_recovery` and `wake_conversation` remain fail-closed until a canonical recovery work/lease resolver is injected. They cannot report simulated success.
- App shutdown closes the browser lifecycle before the database pool.
- Added deterministic lifecycle and HTTP contract tests with injected browser/lock doubles.

## Runtime configuration

- `CBE_CONTROL_TOKEN`: server-only capability, minimum 32 characters.
- `CBE_PROFILE_DIR`: external persistent Chromium profile directory.
- `CBE_HEADLESS`: defaults to true.
- `CBE_HUMAN_AUTH_URL`: optional HTTPS human-authentication surface.

No credential values are committed to the repository.

## Follow-on dependency

Deploy or stage this server capability on a runtime with Playwright Chromium available and a persistent volume for `CBE_PROFILE_DIR`. Bind the Operator Console server-side adapter to the endpoint. Conversation wake remains separately gated on the exact canonical recovery work/lease resolver.
