# Assistant-response analytics and observability provenance

Date: 2026-10-07

## Milestone

- Issue: #46, Add assistant-response analytics and observability layer
- Pull request: #47
- Starting authoritative main: `cfea745680f627e23d6e31541ca4f66ea214b353`
- Feature branch: `issue-46-assistant-observability`

## Purpose

Expose persisted assistant-response telemetry as a first-party, read-only analytics API and browser surface so model usage, token consumption, estimated cost, latency, and quality-gate overhead can be inspected without querying raw PostgreSQL JSON manually.

## Implemented accounting contract

Persisted `comind.cm_message.meta` remains the telemetry source of truth. The analytics layer does not duplicate or rewrite provider telemetry.

Metered events are normalized before aggregation:

- An assistant response without a quality gate contributes its top-level provider event once.
- A quality-gated response contributes the metered `draft`, `verifier`, and `repair` passes from `quality_gate.passes`.
- The `final` pass is a source marker, not another provider call.
- For repaired answers, top-level provider metadata duplicates the selected repair response and is therefore excluded from the metered-event set. This prevents double-counting repair tokens, latency, and cost.
- Base-generation cost and quality-gate overhead are reported separately.
- Combined known cost is the sum of normalized metered events only.
- Missing or unpriced costs are counted explicitly and are never coerced into a fabricated zero-dollar estimate.
- Cached-input, cache-write, output, reasoning, and total tokens remain distinct telemetry dimensions.

## Surface

- `GET /api/analytics/assistant-responses` returns aggregate assistant-response telemetry only. It does not return prompt or response content.
- `GET /analytics` serves a read-only browser dashboard over the aggregate API.
- Existing `GET /api/analytics/summary` remains compatible.

## Verification design

Deterministic route tests cover the response contract and read-only dashboard behavior.

An isolated PostgreSQL integration test creates synthetic provider metadata in `comind_ci` and verifies JSONB aggregation, provider/model breakdown, explicit unknown-cost handling, quality outcomes, and the repaired-response non-double-counting invariant. No paid provider request is used.

## Failures encountered and corrections

Two test-fixture defects were deliberately allowed to fail closed rather than weakening gates:

1. The first unit run omitted the test-only `DATABASE_URL` required during application import. The test harness was corrected to use the repository's established isolated test URL pattern. Production code was unchanged.
2. The first PostgreSQL integration fixture inserted a conversation with only `title`, while the real schema requires `source`. The fixture was corrected to mirror the application conversation contract with the seeded `comind` project and `source='live'`. Production schema and constraints were unchanged.

These failures were free deterministic checks and caused no provider spend.

## Safety state

- No live Supabase mutation.
- No paid OpenAI or other provider call.
- No embedding call.
- No credentials or secret values added to source, tests, logs, issue text, or provenance.
- Analytics endpoints are read-only.
- Prompt and response content are excluded from aggregate analytics output.

## Final verification

The final feature-head and exact GitHub Actions evidence are recorded in PR #47 and the durable CoMind Development Runbook and Workaround Ledger after all gates complete.
