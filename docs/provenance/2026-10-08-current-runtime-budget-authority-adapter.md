# Current-Runtime Budget Authority Adapter Provenance

Date: 2026-10-08
Issue: #59
PR: #60
Base authoritative main: `47ee6a44f39a94f2c7281b56d7626a70f5612bf7`

## Objective

Bridge the hardened durable paid-provider budget authority established by Issue #57 to current `comind.cm_*` runtime identities and provider telemetry without reviving the legacy public-schema identity model, creating a second financial ledger, or duplicating pricing truth.

## Long-term execution boundary

CoMind governed agents are expected to execute workflows and receive governed access to databases, tools, and paid providers. The adapter therefore treats the current chat assistant as one execution client rather than the architectural center.

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
   - Links a finalized Issue #57 reservation to authoritative telemetry in `comind.cm_message.meta`.
   - Stores locator and immutable identity metadata, not message content or duplicated cost values.
   - Supports root assistant telemetry and named quality-gate provider passes.

All three provenance tables are append-only and RLS-protected from client roles.

## Pricing and settlement boundary

The reviewed OpenAI rate-card estimator in `server/src/providers/openai-rate-card.ts` remains the pricing source of truth.

The adapter reservation function accepts a bounded worst-case exposure amount from the future runtime policy/pricing layer and does not price provider usage itself.

For persisted assistant executions, the settlement adapter reads the already-persisted authoritative cost result from `comind.cm_message.meta` and delegates settlement to `public.comind_finalize_paid_provider_cost`.

A single persisted assistant message may contain multiple provider-backed quality passes. Stable telemetry locators distinguish executions within the message, including:

- `root`
- `quality_gate.passes.draft`
- `quality_gate.passes.verifier`
- `quality_gate.passes.repair`

This prevents the application from assuming one assistant-response request equals one paid provider execution.

## Fail-closed behavior

The adapter preserves Issue #57 behavior for:

- atomic reservation against a hard cost envelope;
- reservation idempotency;
- provider-event identity uniqueness;
- telemetry identity uniqueness;
- unknown-cost exposure retention;
- stale exposure retention;
- evidence-backed closure and reconciliation;
- append-only financial transition history.

The adapter additionally fails closed on:

- missing current runtime identities;
- conflicting conversation/project identity;
- conflicting agent-run/agent identity;
- cross-organization identity inconsistencies;
- conflicting adapter idempotency provenance;
- ambiguous or unsupported telemetry locators;
- provider mismatch between reservation and persisted telemetry;
- message telemetry from a conversation other than the bound execution;
- attempts to settle an agent-only execution using unrelated conversation telemetry.

## Verification

Files added for this milestone:

- `db/migrations/20261008_002_current_runtime_budget_authority_adapter.sql`
- `db/migrations/20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql`
- `db/migrations/verify_20261008_002_current_runtime_budget_authority_adapter.sql`
- `scripts/test_runtime_budget_authority_adapter.sh`
- `.github/workflows/runtime-budget-authority-adapter.yml`

The permanent CI harness uses isolated PostgreSQL 17 plus pgvector. It installs the real current `comind.cm_*` schema, the test-only legacy FinOps prerequisite fixture, FinOps v1, Issue #57 hardening, and the current-runtime adapter.

The verification covers:

- current project, conversation, agent, and agent-run binding;
- identity derivation and conflict rejection;
- explicit proof that test envelopes do not depend on legacy public project or agent identity;
- adapter reservation idempotency;
- root and named quality-pass telemetry settlement;
- unknown-cost exposure retention;
- stale reservation exposure retention;
- append-only adapter provenance;
- migration reapplication;
- independent-client concurrency through the adapter, requiring exactly one USD 0.60 reservation to succeed against a USD 1.00 hard limit while the competing reservation is denied.

## Failure and correction evidence

The first adapter CI execution exposed a PL/pgSQL output-column shadowing defect inside `cm_reserve_paid_provider_execution`: an unqualified `reservation_id` table reference conflicted with the function's `RETURNS TABLE` output column.

This is the same PostgreSQL name-resolution class previously observed during Issue #57. The correction qualifies adapter table references and hardens named JSON quality-pass extraction in the follow-up migration `20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql`.

## Safety

During Issue #59 implementation to this provenance checkpoint:

- no live Supabase mutation occurred;
- no production deployment occurred;
- no paid OpenAI or other provider call occurred;
- no credentials or secret values were committed or printed;
- no prompts or responses were copied into financial authority provenance.

## Next layer after this milestone

Once Issue #59 is merged and post-merge gates are green, the next logical layer is runtime wiring that computes bounded worst-case provider exposure using the existing rate-card and policy inputs, reserves that exposure before each paid provider execution, and settles the reservation from persisted telemetry afterward.

That runtime wiring must support each individual provider execution, including quality-gate draft, verifier, and repair calls, and should be proven in isolated `comind_runtime` before any paid live end-to-end verification.

A later tightly bounded live end-to-end test should prove the complete governed chain: reserve before provider execution, execute exactly the allowed paid call, persist provider telemetry, settle exactly once, release or retain exposure correctly, and leave auditable provenance queryable afterward.
