# TK-007 ThreadKeeper C4 Operational Substrate Evidence

Date: 2026-10-27
Issue: #272
Pull request: #273
Environment: Test-first
Current canonical maturity: C3 Integrated
Target gate: C4 Operational
Production activation: false

## Purpose

This record preserves the first TK-007 execution slice. It establishes the operational substrate and proof contract required before ThreadKeeper can be promoted from C3 Integrated to C4 Operational.

This record is not itself a C4 promotion decision.

## Governing boundary

Founder authority for TK-007 permits ThreadKeeper-owned runtime behavior, Test activation, schema changes, application/API-module changes, and a later governed C4 Operational promotion if evidence supports it.

Production activation remains outside this authority.

ThreadKeeper continues to own continuity scope identity, checkpoint lineage, continuity assessment, bounded resolution routing, continuity cases, continuity evidence, and bounded continuity context. It does not absorb Conversation History, Foundry execution, Memory Graph, Agent Communication, SEAL, EIK, or Canonical Development Evidence authority.

## Reuse finding

The existing implementation already supplied most C4 correctness primitives:

- `server/src/threadkeeper/service.ts` for bounded observation, assessment, routing, checkpoint proposal, and externally authorized acceptance;
- `server/src/threadkeeper/repository.ts` for persistent scopes, immutable checkpoints, assessments, cases, transitions, stale-head protection, idempotency, and context reconstruction;
- existing ThreadKeeper PostgreSQL schema with append-only guards and scope-integrity checks;
- existing C2/C3 evidence gates and Test integration;
- existing Maintenance Control and exact-head CI;
- existing Conversation History read-only integration from TK-006.

The material C4 gap was durable operational evidence across process boundaries. Existing observability counters were in-memory only and could not independently reconstruct runtime attempts, failures, recovery, stale work, or the last known healthy operation after restart.

## Operational substrate

Migration `db/migrations/20261027_007_threadkeeper_c4_operational_events.sql` adds:

- append-only `comind.cm_threadkeeper_operation_event`;
- explicit STARTED, SUCCEEDED, FAILED, and BLOCKED event states;
- operation, predecessor, and recovery lineage;
- actor, authority, policy, correlation, trace/span, service identity, evidence, result/error, duration, and event digest fields;
- one root event per operation and one terminal successor per STARTED event;
- validation and immutability triggers;
- RLS;
- security-invoker `comind.v_threadkeeper_operation_status`;
- dedicated `comind_threadkeeper_runtime` role.

The runtime role is NOLOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and NOREPLICATION. It has only SELECT/INSERT on ThreadKeeper-owned control-plane tables and SELECT on the operation-status projection. It has no UPDATE, DELETE, or TRUNCATE authority.

Where the existing `service_role` is present, it receives SET-only role delegation. The runtime does not inherit broad session privileges merely by membership.

## Application/runtime implementation

`server/src/threadkeeper/operations.ts` adds durable operation start/terminal recording, digest verification, recovery linkage, stale-operation detection, and operational health reconstruction.

The C4 tests set `PGOPTIONS=-c role=comind_threadkeeper_runtime` so the application database pool itself begins work under the constrained role. The proof therefore exercises existing checkpoint, assessment, case, transition, and new operation persistence through the least-privilege runtime identity rather than merely proving the role exists.

## Sustained proof contract

`server/test/threadkeeper-c4-operational.integration.test.mjs` exercises one bounded synthetic operational sequence containing:

1. root continuity operation and checkpoint acceptance through external authority;
2. explicit rejection of ThreadKeeper self-authority;
3. suspected continuity break and durable case lifecycle;
4. authorized divergence and successor checkpoint lineage;
5. competing stale-head checkpoint rejection;
6. process-style service reconstruction with idempotent persistence reuse;
7. evidence-resolver failure with retained FAILED operational evidence;
8. recovery under a successor operation;
9. stale in-flight operation detection;
10. explicit blocking of stale work and recovery by a replacement instance;
11. negative UPDATE/DELETE and private-archive access checks;
12. final operator health reconstruction.

The final live Test artifact must show a healthy terminal state, zero unrecovered failures, zero stale in-flight operations, successful stale-head rejection, restart idempotency, and constrained-role negative-access evidence before C4 promotion is considered.

## Isolated exact-head evidence

The hardened PR head `b0afeb6c2bbeb945923c5e01b4d40f91af3c7d13` passed the dedicated `TK-007 ThreadKeeper C4 Operational` isolated proof before this provenance commit was added. The proof included the constrained application pool role path.

Because this provenance commit changes the PR head and intentionally triggers MCTRL, the final accepted pre-merge evidence must reference the newer exact head and its successful C4, MCTRL, and broad CI runs. The earlier head is retained as historical development evidence only.

## Supabase Test deployment

The migration was applied to CoMind Supabase Test as `threadkeeper_c4_operational_events` only after the isolated proof passed.

Post-deployment readback established:

- `comind_threadkeeper_runtime` has the intended restricted role attributes;
- all six ThreadKeeper tables in the runtime boundary have RLS enabled;
- each has exactly the runtime SELECT and INSERT policies;
- runtime SELECT/INSERT is available and UPDATE/DELETE is unavailable;
- `anon` and `authenticated` cannot read the ThreadKeeper operational evidence;
- the status view is available to the runtime role and unavailable to ordinary Data API roles;
- `service_role` can SET the runtime role without inheriting it automatically.

No production schema or data was changed.

## Advisor review

Supabase security advisor review after Test deployment produced no new ThreadKeeper security finding attributable to TK-007.

Supabase performance advisor review produced no new missing ThreadKeeper foreign-key index finding. Newly created operation indexes were reported unused before the first live operational run, which is expected at zero operational rows and is not treated as evidence of a defect.

Existing unrelated project advisor findings remain outside TK-007.

## Engineering-practice review

The design was checked against current PostgreSQL role-membership semantics, OpenTelemetry observability conventions, Supabase RLS/security guidance, and reliability practices that favor durable failure evidence, bounded recovery, and reconstructable operational state.

The resulting design intentionally keeps canonical continuity state separate from operational telemetry. Operational evidence can describe execution and recovery, but it cannot silently promote a checkpoint or maturity state.

## Remaining C4 gate

Before promotion:

1. final exact-head PR C4 proof, MCTRL, and broad CI must pass;
2. PR #273 must merge from the tested head;
3. the post-merge C4 workflow must execute the sustained proof against Supabase Test through `comind_threadkeeper_runtime`;
4. the retained live artifact and database event chain must reconcile;
5. Test security posture and Maintenance Control must remain clean;
6. canonical Development Evidence must record the accepted C4 evidence and independent acceptance;
7. only then may a separate promotion change move ThreadKeeper to C4 Operational;
8. `production_activation` must remain false unless separately authorized.

## Recovery

If the C4 proof fails, ThreadKeeper remains C3 Integrated. Operational failures and partial attempts remain evidence. The Test migration is additive and append-only; recovery should be forward repair rather than destructive rewriting of accepted continuity history.
