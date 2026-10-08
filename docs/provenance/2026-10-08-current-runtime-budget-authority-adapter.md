# Current-Runtime Budget Authority Adapter Provenance

Date: 2026-10-08
Issue: #59
PR: #60
Base authoritative main: `47ee6a44f39a94f2c7281b56d7626a70f5612bf7`

## Objective

Bridge the hardened durable paid-provider budget authority established by Issue #57 to current `comind.cm_*` runtime identities and authoritative provider telemetry without reviving the legacy public-schema identity model, creating a second financial ledger, or duplicating pricing truth.

This milestone remains one layer below live provider operation. It does not connect a live durable database, mutate live Supabase, deploy production, or make a paid provider call.

## Long-term execution boundary

CoMind governed agents are expected to execute workflows and receive governed access to databases, tools, paid providers, and other platform capabilities. The adapter therefore treats the current chat assistant as one execution client rather than the architectural center.

Current runtime identity sources used or supported by this layer are:

- `comind.cm_project`
- `comind.cm_actor`
- `comind.cm_agent`
- `comind.cm_agent_run`
- `comind.cm_conversation`
- `comind.cm_message`

There is no current `comind.cm_workflow` table. This milestone does not invent one. The FinOps `workflow_run_id` remains a generic execution-correlation identifier until a current governed workflow model exists.

## Architectural choice

Issue #59 introduces a thin provenance and invocation adapter over the single hardened Issue #57 accounting authority.

The adapter does not copy current identities into legacy `public.projects` or `public.agents`. Those objects remain only as isolated-test prerequisites needed to instantiate dormant FinOps v1.

The adapter creates three current-runtime provenance objects:

1. `comind.cm_budget_authority_binding`
   - Binds one existing FinOps cost envelope to current runtime provenance.
   - Supports conversation, agent-run, generic workflow, and service execution kinds.
   - Derives project identity from a conversation and agent identity from an agent run where available.
   - Rejects conflicting current-runtime identity and cross-organization identity combinations.

2. `comind.cm_budget_authority_reservation`
   - Links an Issue #57 reservation to the current execution binding, provider code, operation, execution role, and idempotency key.
   - Does not store monetary values.
   - Delegates reservation authority to `public.comind_reserve_paid_provider_cost`.

3. `comind.cm_budget_authority_telemetry`
   - Links an Issue #57 reservation to authoritative telemetry in `comind.cm_message.meta`.
   - Stores locator and immutable identity metadata, not message content or duplicated monetary values.
   - Supports root assistant telemetry and named quality-gate provider passes.

All three provenance tables are append-only and RLS-protected from client roles.

## Provider execution and pricing boundary

The reviewed OpenAI rate-card estimator in `server/src/providers/openai-rate-card.ts` remains the pricing source of truth.

The adapter reservation function accepts a bounded worst-case exposure amount from the runtime policy/pricing layer and does not price provider usage itself.

For persisted assistant executions, the settlement adapter reads the already-persisted authoritative cost result from `comind.cm_message.meta` and delegates settlement to `public.comind_finalize_paid_provider_cost`.

A single persisted assistant message may contain multiple provider-backed quality passes. Stable telemetry locators distinguish executions within the message:

- `root`
- `quality_gate.passes.draft`
- `quality_gate.passes.verifier`
- `quality_gate.passes.repair`

Quality-gated messages are forbidden from settling top-level root telemetry. They must settle each paid provider pass individually. This prevents one assistant response from collapsing multiple provider executions into one charge or double-counting duplicated final metadata.

Known-cost settlement requires explicit USD currency, a reviewed rate-card version, and pricing-source provenance. Missing or ambiguous known-cost provenance fails closed. Unknown cost remains `unknown_cost` and retains reserved exposure through the hardened authority.

## Lifecycle delegation

The adapter delegates monetary lifecycle authority to Issue #57.

- Atomic reservation delegates to `public.comind_reserve_paid_provider_cost`.
- Telemetry settlement delegates to `public.comind_finalize_paid_provider_cost`.
- Confirmed pre-provider cancellation or pre-provider failure delegates through `comind.cm_close_unspent_paid_provider_execution` to the hardened evidence-backed close function.
- Once provider telemetry is linked, the adapter refuses the unspent-close path.
- Stale reservations, unknown cost, reconciliation, provider-event uniqueness, telemetry identity uniqueness, envelope-first locking, immutable financial audit events, and hard-limit serialization remain owned by the hardened financial authority.

The adapter does not duplicate reservation state or monetary totals.

## Migration sequence

The final deterministic migration sequence is:

1. `db/migrations/20261008_002_current_runtime_budget_authority_adapter.sql`
2. `db/migrations/20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql`
3. `db/migrations/20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql`

The isolated harness reapplies all three in order to prove reapplication safety.

## Verification

Permanent isolated verification uses PostgreSQL 17 plus pgvector and database `comind_ci`. It installs the real current `comind.cm_*` schema, the test-only legacy FinOps prerequisite fixture, FinOps v1, Issue #57 hardening, and the Issue #59 adapter.

Verification files and harness:

- `db/migrations/verify_20261008_002_current_runtime_budget_authority_adapter.sql`
- `db/migrations/verify_20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql`
- `scripts/test_runtime_budget_authority_adapter.sh`
- `.github/workflows/runtime-budget-authority-adapter.yml`

Coverage includes:

- current project, conversation, agent, and agent-run binding;
- identity derivation and conflict rejection;
- explicit proof that test envelopes do not depend on legacy public project or agent identity;
- adapter reservation idempotency;
- root and named quality-pass telemetry settlement;
- fail-closed rejection of quality-gated root settlement;
- fail-closed rejection of known cost without pricing provenance;
- unknown-cost exposure retention;
- stale reservation exposure retention;
- confirmed-unspent close through the current-runtime adapter;
- rejection of unspent closure after provider telemetry is linked;
- append-only adapter provenance;
- migration reapplication;
- independent-client concurrency through the adapter.

The adapter concurrency harness launches two independent PostgreSQL clients, each requesting USD 0.60 against one USD 1.00 hard limit. Acceptance requires exactly one reservation approval, one denial, USD 0.60 held exposure, and no oversubscription.

## Failure and correction evidence

The first adapter CI execution exposed a PL/pgSQL output-column shadowing defect inside `cm_reserve_paid_provider_execution`: an unqualified `reservation_id` table reference conflicted with the function's `RETURNS TABLE` output column.

This is the same PostgreSQL name-resolution class observed during Issue #57. The correction qualifies adapter table references and hardens named JSON quality-pass extraction in `20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql`.

Subsequent review identified lifecycle boundaries that needed to be explicit before runtime wiring:

- root telemetry from a quality-gated message could otherwise be mistaken for a single provider execution;
- a known cost without explicit rate-card provenance could otherwise be accepted too loosely;
- current-runtime callers needed an adapter-owned confirmed-unspent close path rather than bypassing the adapter and invoking legacy-named authority directly.

`20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql` closes these gaps and adds deterministic verification for them.

## Exact-head verification checkpoint

Current branch head at this checkpoint: `e27b6dc5b8d069f393d9a6fcf7650f5c2b695d79`

- Runtime Budget Authority Adapter: https://github.com/jlhogarth/CoMind/actions/runs/37730330172, passed.
- No Placeholder Policy: https://github.com/jlhogarth/CoMind/actions/runs/37730330125, passed.
- CoMind Repository Configuration: https://github.com/jlhogarth/CoMind/actions/runs/37730330116, passed.
- Full CI: https://github.com/jlhogarth/CoMind/actions/runs/37730330269. At this checkpoint all substantive jobs and verification steps are green; GitHub is finishing the final service-container shutdown step before marking the workflow completed.

## Safety

During Issue #59 implementation and verification:

- no live Supabase mutation occurred;
- no production deployment occurred;
- no paid OpenAI or other provider call occurred;
- no credentials or secret values were committed or printed;
- no prompts or responses were copied into financial authority provenance.

## Next layer and later live end-to-end gate

After Issue #59 is merged and post-merge gates are green, the next logical layer is runtime wiring that computes bounded worst-case provider exposure from existing rate-card and policy inputs, reserves before each paid provider execution, and settles from authoritative persisted telemetry afterward.

Runtime wiring must support each individual provider execution, including quality-gate draft, verifier, and repair calls, plus future governed agent workflow, database, and tool execution.

A later tightly bounded live end-to-end test should be run only after deterministic adapter tests, runtime wiring, fail-closed guardrails, and isolated integration are green. The target proof is:

`governed execution -> current runtime provenance -> bounded worst-case exposure -> atomic reservation -> provider execution -> authoritative telemetry persistence -> settlement -> auditable runtime and financial provenance`

That future live verification should use the smallest provider request needed, zero unnecessary retries, explicit cost bounds, existing paid-test guardrails, and isolated `comind_runtime` before any consideration of live durable-store wiring.
