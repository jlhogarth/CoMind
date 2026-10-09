# Foundry runtime orchestration provenance

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/73
Pull request: https://github.com/jlhogarth/CoMind/pull/77
Authoritative base: `68d4ae5169e2f047d6c1b15d8a3abc578721658e`
Verified implementation head before provenance commit: `b53495c5d1420dfc85cbb4472900103280d20fdd`

## Purpose

Issue #73 turns the database-only Foundry substrate from Issue #70 / PR #71 into the first executable, provider-independent governed Foundry runtime layer. The milestone remains repository-only and isolated. It does not activate autonomous Virtual Employees against GitHub, Google Drive, Supabase, OpenAI, or any other external system.

The deterministic orchestration chain is:

profile -> capability -> scoped grant -> authorization request and approved decision -> execution context -> recovery checkpoint -> adapter operation -> deterministic local adapter -> adapter result -> execution outcome.

## Reused authoritative layers

Issue #73 deliberately does not introduce a second identity, budget, pricing, retry, provider-execution, or settlement authority.

- `cm_actor`, `cm_agent`, and the PR #71 Foundry profile remain the durable identity chain.
- PR #71 capability, grant, authorization, execution-context, deliberation, recovery, and adapter-operation tables remain the Foundry provenance substrate.
- Existing `cm_budget_authority_binding` remains the budget-binding authority for any cost-bearing capability.
- Existing governed provider execution remains the provider reservation, retry-attempt, telemetry, and settlement authority.
- `comind_pm` remains the provider-independent project-management ledger.

## Append-only lifecycle correction

PR #71 intentionally made execution contexts and adapter operations append-only while those tables still contained lifecycle-oriented columns such as `closed_at`, `status`, and `completed_at`.

Issue #73 does not weaken the append-only protections to mutate those rows. Instead it adds:

- `cm_foundry_adapter_operation_result`, with exactly one terminal result per immutable adapter operation;
- `cm_foundry_execution_outcome`, with exactly one terminal outcome per immutable execution context.

Both tables enable RLS, deny direct `PUBLIC`, `anon`, and `authenticated` access, grant `service_role` only `SELECT` and `INSERT`, and use the existing Foundry append-only mutation guard for update/delete rejection.

The completion records store bounded status, references, fingerprints, error codes, summaries, and timestamps. They do not add credentials, raw provider payloads, message content, token counts, or duplicate monetary accounting.

## Capability broker contract

`server/src/foundry-runtime.ts` adds the provider-independent orchestration kernel and in-process adapter registry.

Before adapter dispatch the broker requires:

1. an existing uniquely resolved Foundry profile and capability;
2. active profile state;
3. requested authority no higher than both profile and capability ceilings;
4. exact capability target kind;
5. a registered in-process adapter;
6. an unrevoked, unexpired capability grant whose project/environment/authority/scope authorize the request;
7. an approved, unexpired authorization decision whose underlying request matches profile actor, capability, project, task, authority, environment, target kind, and target reference;
8. a valid existing budget binding for any cost-bearing capability;
9. unused execution idempotency identity;
10. isolated environment only;
11. C0, C1, or C2 only. C3 and C4 fail closed.

Only after those checks does the kernel create an execution context, pre-dispatch recovery checkpoint, and adapter-operation provenance record.

## Adapter boundary

Issue #73 registers only deterministic in-process adapters supplied by the caller. The integration test uses `fake_local`.

No production GitHub, Drive, Supabase, OpenAI, PM, notification, or other external adapter is implemented or invoked by this milestone.

Adapter execution receives bounded execution identity, capability/action, authority, target, canonical request fingerprint, and JSON-compatible input. Terminal results are validated and reduced to bounded provenance before persistence. Adapter exceptions or malformed terminal results become sanitized failed outcomes.

## Recovery semantics

Recovery checkpoints are resumability records, not authority grants.

`resumeFromCheckpoint` refuses a successfully completed or cancelled execution, requires a fresh execution idempotency key, verifies checkpoint profile/capability/project/task/environment lineage, and then re-enters the complete execution broker. Current grants, authorization, scope, adapter registration, idempotency, and budget binding are therefore revalidated before any new dispatch.

## Deliberation semantics

Issue #73 extends the PR #71 deliberation substrate with bounded runtime metadata:

- review round 1 or 2 only;
- arbitration pass 0 or 1 only;
- optional explicit reply-to event lineage;
- decision, dissent, and deferred event types;
- `accepted_with_dissent` terminal outcome.

Runtime helpers enforce:

- every active participant must contribute before closure, so silence is not agreement;
- an explicit decision event is required;
- dissent prevents plain `accepted` and requires `accepted_with_dissent` if the outcome is otherwise accepted;
- a deferred outcome requires an explicit next decision/evidence trigger;
- no new runtime event may be appended after a terminal outcome;
- the database unique constraint preserves exactly one terminal deliberation outcome.

This is deterministic protocol verification only. It is not a claim that the autonomous Day 1 Foundry Council Drill has occurred.

## Deterministic verification

The permanent `Foundry Runtime Orchestration` GitHub Actions workflow uses PostgreSQL 17 plus pgvector with only the local `comind_ci` database.

`scripts/test_foundry_runtime_orchestration.sh`:

1. rejects non-local or non-`comind_ci` database targets;
2. runs the existing Foundry substrate verification;
3. applies the Issue #73 migration;
4. reapplies it to prove idempotency;
5. runs the Issue #73 SQL security/lifecycle verifier;
6. installs server dependencies and builds TypeScript;
7. runs the complete server unit test suite;
8. runs the dedicated Foundry runtime integration test.

The dedicated integration proof exercises one complete deterministic fake-adapter success chain and fail-closed cases for:

- duplicate execution idempotency;
- completed-checkpoint replay;
- missing capability grant;
- expired capability grant;
- revoked capability grant;
- denied authorization;
- expired authorization;
- authorization target mismatch;
- unregistered adapter;
- cost-bearing execution without a budget binding;
- capability authority overflow;
- inactive/suspended profile;
- missing authorization decision;
- non-isolated environment;
- C3 execution;
- recovery with reused idempotency;
- recovery scope revalidation;
- recovery budget revalidation;
- participant silence;
- dissent-aware closure;
- terminal deliberation immutability through the runtime API.

The fake adapter executes exactly once across the integration proof, demonstrating that all negative broker cases fail before adapter dispatch.

## CI harness correction

The first PR-head CI cycle exposed a test-discovery boundary issue, not a Foundry runtime failure. The legacy conversation-lifecycle script globbed every `server/test/integration/*.test.mjs` file while intentionally bootstrapping only the legacy conversation schema. It therefore discovered the new Foundry integration test without applying Foundry migrations and failed because `cm_foundry_agent_profile` was correctly absent.

The correction keeps the suites independent: the conversation-lifecycle harness now excludes the Foundry-specific integration file, while the dedicated Foundry workflow remains the only harness that applies the Foundry substrate and orchestration migrations before running that test.

No application behavior or live database state was changed to resolve this CI failure.

## Exact implementation-head evidence

After the harness correction, exact head `b53495c5d1420dfc85cbb4472900103280d20fdd` reported 12 GitHub check runs, all completed successfully:

- build;
- conversation-lifecycle-integration;
- foundry-agent-substrate;
- dev-runtime-verification;
- finops-budget-authority;
- pm-ledger-migration;
- devcontainer-runtime;
- runtime-budget-authority-adapter;
- Repository health and Supabase configuration;
- governed-provider-execution;
- Reject unresolved development markers;
- foundry-runtime-orchestration.

Workflow runs on the same exact head also completed successfully for CI, Foundry Runtime Orchestration, Governed Provider Execution, Runtime Budget Authority Adapter, CoMind Repository Configuration, and No Placeholder Policy.

A final permanent-gate cycle is required on the provenance-adjusted PR head before merge readiness is claimed.

## Tooling artifacts

During Issue #73 branch setup, connector function selection accidentally created Issues #74, #75, and #76. Each was immediately closed as `not planned`, retitled as an accidental connector artifact, and received no implementation branch, commit, or pull request. Issue #73 remains the sole implementation milestone for this lane.

## Safety state

Issue #73 implementation and verification used:

- no live Supabase mutation;
- no paid OpenAI or other provider request;
- no live provider token-count request;
- no external adapter mutation;
- no production deployment;
- no C3/C4 execution;
- no automatic provider retries;
- no broad human connector authority;
- no credential or secret exposure.

All adapter-facing verification is deterministic, local, and network-free.

## Deferred activation layers

This milestone does not establish autonomous Foundry employment or external authority. Before real cost-bearing or externally mutating adapters are activated, the appropriate adapter-specific least-privilege identity, recovery, authorization, budget, idempotency, and deterministic test layers must be accepted. Issue #72 remains relevant to governed provider failure/recovery before autonomous paid-provider execution is considered.
