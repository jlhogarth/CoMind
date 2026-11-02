# CBE-HOST-002 Acceptance Measurement Harness Provenance

Date: 2026-11-01
Issue: #507
Production change: false
Railway mutation: false
Paid commitment: false

## Purpose

Create the deterministic measurement harness required before a live Railway Development/Test CBE acceptance deployment is authorized.

CBE-HOST-001 established the hosting topology and cost gate. CBE-HOST-002 turns the future live test into a bounded, repeatable experiment with predefined evidence rather than manual browser operation.

## Implemented slice

- Added `server/scripts/cbe-railway-acceptance.mjs`.
- Added `npm run cbe:railway-acceptance`.
- Added deterministic tests using a local mock CBE endpoint.
- Added a machine-readable acceptance evidence schema.
- Added `docs/CBE-RAILWAY-ACCEPTANCE-RUNBOOK.md`.
- Added static contract verification and exact-head CI.

## Runtime sequence

The acceptance runner performs only:

1. `stop_browser` for an idempotent stopped baseline;
2. `start_browser` for governed persistent Chromium startup;
3. bounded hold for metric collection;
4. `stop_browser` for clean shutdown and profile-lock release.

The runner does not contain or invoke `wake_conversation`, `retry_recovery`, or `open_auth`.

Every request is explicitly:

- `environment=development-test`
- `production_change=false`
- `work_key=null`
- `recovery_id=null`

The hold interval is capped at 60 seconds. Per-request timeout is capped at 60 seconds.

## Network boundary

The acceptance endpoint must be HTTPS unless it is localhost or a Railway `*.railway.internal` private-network host. This permits private service-to-service testing without allowing bearer capability transmission over public plaintext HTTP.

## Secret handling

`CBE_CONTROL_TOKEN` is read from the process environment and used only in the Authorization header. It is not included in returned evidence.

Deterministic tests explicitly assert that serialized evidence does not contain the test bearer token.

No live token, database credential, browser cookie, authentication state, or secret value was committed.

## Evidence model

The future live evidence package combines:

- sanitized runner action/timing output;
- Railway CPU, memory, disk, and network metrics;
- deployment-to-health timing;
- persistent-profile restart verification;
- Serverless behavior if separately evaluated;
- bounded acceptance cost;
- Free/Hobby/undetermined plan recommendation.

The evidence schema explicitly includes the CBE-HOST-001 required measurements: idle memory, browser startup peak memory, browser steady memory, peak CPU, health latency, profile persistence, Serverless behavior, and bounded cost.

## Governance boundary

No Railway mutation was performed in CBE-HOST-002. No service, volume, variable, domain, deployment, payment, subscription, or plan was created or changed.

This harness does not authorize live hosting. The next live deployment slice requires explicit human authorization for any paid commitment or bounded maximum test exposure before Railway resources are accepted/deployed.

A successful hosting experiment will still not prove AED conversation return. The exact PM work-item to Foundry recovery task/lease resolver remains a separate dependency before live conversation-wake acceptance.
