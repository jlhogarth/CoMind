# Durable paid-provider budget authority provenance

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/57
Pull request: https://github.com/jlhogarth/CoMind/pull/58
Base authoritative main: `a292eda445c863bb762681e9d3cf9e96b1d1c92b`
Branch: `issue-57-durable-budget-authority`

## Purpose

Issue #57 establishes the first durable cross-run paid-provider budget-authority contract by hardening CoMind's existing FinOps and Resource Governor primitives. It deliberately does not create a second pricing system or a parallel post-call spending ledger.

The governing invariant is that a bounded amount of budget must be atomically reserved before a paid operation can later be authorized. Settlement then reconciles the reservation to the known provider cost or leaves the exposure conservatively held when cost is uncertain.

## Existing architecture reused

The repository already contained the accepted FinOps and Resource Governor design and migration with:

- `comind_budget_policies`
- `comind_workflow_cost_envelopes`
- `comind_cost_reservations`
- `comind_usage_events`
- `comind_reserve_cost()`
- `comind_record_usage()`

Issue #57 extends those primitives rather than introducing a duplicate ledger.

Persisted assistant/provider telemetry in `comind.cm_message.meta` remains the provider-usage telemetry source of truth. The reviewed OpenAI rate-card estimator remains the pricing source of truth. The budget ledger stores the settled monetary result and immutable identities needed for enforcement and reconciliation; it does not contain a competing provider price catalog.

## Compatibility boundary discovered

The FinOps v1 migration predates the current `comind.cm_*` runtime schema. Its original foreign-key dependencies refer to older public-schema objects such as `projects` and `agents`.

Issue #57 therefore validates the FinOps accounting contract in a dedicated isolated PostgreSQL fixture that supplies only the exact legacy prerequisite shapes required by that migration. This fixture is test-only and does not pretend that the dormant FinOps v1 schema is already wired into the current runtime.

Bridging the hardened authority to the current CoMind runtime, selecting the durable operational store, and placing reservation/finalization calls around actual provider execution are explicitly deferred to a later governed milestone.

## Hardened accounting contract

The hardening migration adds:

1. Twelve-decimal monetary precision for envelopes, reservations, usage settlement, and audit events so the ledger does not truncate the precision produced by the current provider-cost estimator.
2. An idempotency key unique within each cost envelope so accounting retries cannot create duplicate budget claims.
3. Unique provider-event and telemetry identities within each provider so one external execution cannot be settled against multiple reservations.
4. Canonical paid-provider lifecycle states: `reserved`, `finalized`, `cancelled`, `failed`, `stale`, and `unknown_cost`. Legacy FinOps v1 states remain readable for compatibility.
5. An append-only `comind_cost_reservation_events` transition ledger for reservation, settlement, cancellation, failure, stale recovery, unknown-cost, reconciliation, and future governed override evidence.
6. Atomic reservation using the existing envelope row as the serialization boundary under PostgreSQL `FOR UPDATE` locking.
7. Idempotent finalization. Replaying the same reservation and immutable execution identities reuses the existing settlement instead of increasing actual cost again.
8. Fail-closed identity and state conflict handling. Conflicting idempotency keys, provider identities, telemetry identities, settlement states, and invalid costs raise instead of guessing.
9. Conservative uncertainty handling. Expired reservations transition to `stale` but continue to consume reserved exposure. Unknown-cost executions also retain their reservation exposure. Neither is silently released.
10. Evidence-backed unspent closure for `cancelled` or confirmed pre-provider `failed` reservations. A reservation that already has provider execution identity cannot use the unspent-close path.
11. Reconciliation from `unknown_cost` to a later known cost while preserving both transition events.
12. RLS and role restrictions on the new audit ledger. `PUBLIC`, `anon`, and `authenticated` have no direct access; backend execution remains through protected server-side authority.
13. Consistent lock ordering across reserve, finalize, and close paths. Budget authority operations acquire the workflow envelope lock before the reservation lock, avoiding an unnecessary deadlock class under concurrent reserve and settlement activity.

## Sensitive-data boundary

The financial ledger does not store prompts, responses, API keys, credentials, secret values, or other unnecessary payloads. Audit records contain only accounting identities, monetary results, lifecycle state, timestamps, and bounded machine-readable reason codes.

## Verification design

Permanent CI adds an isolated PostgreSQL 17 budget-authority job. The test path:

1. creates only the legacy prerequisites required to instantiate the dormant FinOps v1 contract;
2. applies FinOps v1;
3. applies the Issue #57 hardening migration;
4. reapplies the hardening migration to prove migration idempotency;
5. runs deterministic transaction-level verification for reservation and settlement idempotency, conflicting identities, known-cost settlement, unknown-cost reconciliation, cancellation, pre-provider failure, stale exposure retention, audit immutability, RLS, and sensitive-payload exclusion; and
6. launches two independent PostgreSQL clients concurrently, each attempting to reserve USD 0.60 against the same USD 1.00 hard limit. Exactly one reservation must succeed and one must fail, leaving USD 0.60 reserved and never allowing aggregate exposure above the hard limit.

The authoritative final verification status is the PR #58 check suite and its linked GitHub Actions runs.

## CI-discovered hardening lessons

The first isolated CI attempt failed before exercising accounting SQL because the safety check used PostgreSQL `inet_server_addr()` to decide whether the test database was local. GitHub Actions connects through `localhost` to a PostgreSQL service container, but the server correctly reports its Docker bridge address. The guard was changed to validate the configured `DATABASE_URL` hostname and `/comind_ci` database path, then independently confirm `current_database() = 'comind_ci'`. This retains the isolation boundary without misclassifying container networking.

The next CI attempt reached the hardening migration and PostgreSQL rejected widening `comind_workflow_cost_envelopes.estimated_cost` because the existing `comind_workflow_cost_summary` view depends on that column. The migration now drops the summary view inside its transaction, widens the monetary columns, recreates the exact security-invoker summary contract before commit, and reapplies its backend-only grants. A failure anywhere in that transaction therefore restores the prior view and schema together.

Review of concurrent authority paths during that correction also identified inconsistent lock ordering in the first draft: reservation acquired envelope then reservation, while settlement and unspent closure acquired reservation then envelope. Finalization and closure now resolve the envelope identity first without a row lock, acquire the envelope row lock, and then lock the reservation. This gives all budget-authority mutations the same lock order and removes that avoidable deadlock pattern.

## Deferred runtime integration

This milestone does not yet place the durable authority in front of the paid OpenAI smoke or assistant provider path. That next integration milestone must choose the durable store deliberately, bridge the hardened FinOps authority to current runtime identities, reserve worst-case permitted exposure before provider execution, and finalize against the already-persisted provider telemetry without duplicating price logic.

## Safety record

- No paid OpenAI or other provider call is required or permitted for Issue #57 verification.
- No live Supabase mutation is part of this milestone.
- No production deployment is part of this milestone.
- No credential or secret value is stored in repository content or test fixtures.
- Current paid-smoke bounds and Issue #55 fail-closed preflight remain unchanged.
