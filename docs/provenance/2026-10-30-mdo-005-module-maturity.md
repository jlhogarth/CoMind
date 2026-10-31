# MDO-005 Governed Module Maturity Transition

Date: 2026-10-30
Issue: #407
PR: #410
Environment: isolated PostgreSQL first; canonical Supabase Test only after repository acceptance and fresh collision review
Production activation: false
Paid provider authorized: false

## Decision

Durable evidence does not support making implementation handoff the immediate MDO-005 milestone.

The accepted persistent MDO plan targets `specified`, while its canonical module remains `conceived`. MDO-001 explicitly reserved module maturity promotion for a separate governed acceptance operation, and MDO-004 preserved that boundary. The accepted planning contributions are evidence-bearing planning narratives, not a deterministic implementation work-package contract.

MDO-005 therefore owns the missing governed transition from an accepted specification plan to canonical module maturity `specified`.

The earlier hypothesis, Governed Module Plan Activation and Implementation Handoff, is deferred. A successor milestone must define structured implementation work packages and separate implementation authority before executable implementation work can be activated.

## Authoritative baseline

MDO-005 began from `main` commit `c6b27f7f61f4817e60c909b7026523333e7480ea`, which merged RLIB-003R PR #405 and repaired the post-merge migration namespace collision by moving RLIB-003 from slot `_026` to `_028`.

While the lane was being established, `main` advanced to `68c702572f3724419782bdbfe2bc3bb222a56482` through HAI-008A documentation only. The changed path was disjoint from MDO-005. The MDO branch was reconciled with that main commit as first parent while preserving its development history.

The accepted MDO Test state read from canonical Supabase Test before implementation was:

- plan ID `2b7a4901-48de-45b4-9023-5e37b73da8ac`;
- plan status `accepted`;
- target stage `specified`;
- module ID `d371d297-34a0-4150-8a32-64b3aae77594`;
- module code `MDO3-TEST`;
- module lifecycle stage `conceived`.

This is the exact gap MDO-005 closes.

## Reuse and architecture

MDO-005 reuses:

- `comind.cm_module_registry` for canonical module identity and current maturity projection;
- `comind.cm_mdo_plan` for the accepted plan and declared target stage;
- MDO-004 plan-disposition history as proof that plan acceptance actually occurred;
- `comind.cm_foundry_capability`, authorization requests, and authorization decisions for authority;
- `comind.cm_actor` for attributable human identity;
- `comind.cm_evidence` for canonical evidence identity;
- `comind.cm_audit_log` for system audit;
- the existing MDO append-only provenance trigger.

It does not create another module registry, task system, evidence store, authorization model, maturity vocabulary, agent registry, runtime, provider ledger, or implementation queue.

## New durable history

MDO-005 adds a generic append-only module lifecycle history:

- `comind.cm_module_lifecycle_event`;
- `comind.cm_module_lifecycle_event_evidence`.

The event relation uses the existing module lifecycle vocabulary but does not itself authorize arbitrary transitions. The MDO-005 transition function permits only `conceived -> specified`.

This gives later maturity milestones one canonical event history without granting those future transitions early.

## Authority contract

Capability `mdo.module.maturity_transition` is:

- target kind `module`;
- maximum authority `C2`;
- non-cost-bearing;
- adapter `mdo`.

A transition requires:

1. an attributable actor whose canonical kind is `person`;
2. an approved, unexpired Foundry authorization decision;
3. the same person as requesting actor and deciding actor;
4. exact project scope;
5. exact module target;
6. isolated environment;
7. exact C2 authority;
8. capability `mdo.module.maturity_transition`.

No service actor, Foundry worker, planning role, model provider, or portfolio coordinator may promote module maturity through this path.

## Evidence and predecessor contract

MDO-005 requires more than a plan row whose status happens to say `accepted`.

The exact plan must:

- belong to the exact module and project;
- have status `accepted`;
- declare target stage `specified`;
- have exactly one governed MDO-004 `accept` disposition event.

The maturity transition must link canonical evidence, and at least one supplied evidence item must already be linked to that governed plan-acceptance event.

This prevents a caller from using unrelated evidence or directly edited plan status as a substitute for accepted specification provenance.

## Maturity boundary

The only transition authorized by MDO-005 is:

`conceived -> specified`

A successful transition:

- appends one immutable lifecycle event;
- links canonical evidence;
- updates only `cm_module_registry.lifecycle_stage` from `conceived` to `specified`;
- appends one audit record.

It does not:

- create implementation tasks;
- create work leases;
- create execution contexts;
- create capability grants;
- make provider calls;
- authorize code changes;
- authorize merge or deployment;
- advance to `prototyped`, `implemented`, `integrated`, or `operational`;
- touch Production.

Plan acceptance and specification maturity therefore remain distinct from implementation authority.

## Idempotency and immutability

Every lifecycle event has a unique idempotency key and authorization decision.

Exact replay returns the original event with `created=false`, even after the current module projection has advanced. A replay with changed module, plan, actor, authorization, target stage, rationale, source reference, or evidence fails closed.

Lifecycle events and evidence links use the accepted MDO append-only mutation guard and reject UPDATE and DELETE.

## Security

The new lifecycle tables enable RLS and revoke browser-role privileges. The security-definer transition function pins `search_path=pg_catalog`, revokes execution from PUBLIC, `anon`, and `authenticated`, and grants only `service_role` execution.

This follows current Supabase guidance that table grants and RLS must be treated together, and that security-definer function execution must be explicitly restricted.

## Test-first acceptance

Repository acceptance requires:

- TypeScript build;
- deterministic service tests;
- accepted MDO service regressions;
- isolated PostgreSQL 17 proof;
- migration reapplication proof;
- structural verification of capability, RLS, grants, function authority checks, and append-only triggers;
- behavioral rejection of unaccepted plans, unrelated evidence, nonhuman actors, expired authority, unsupported stage skips, conflicting replay, and repeated promotion;
- successful `conceived -> specified` transition exactly once;
- unchanged accepted plan status;
- unchanged task, plan-task, lease, execution-context, and contribution counts across the transition;
- audit and evidence readback;
- append-only mutation rejection.

## Failed proof, repair, and accepted isolated evidence

The first exact-head MDO-005 workflow, run `41072826455` on candidate `38c19931e6f5ed20d425fe62a50f0dd3abbace50`, passed the server contract, MDO-001 regressions, MDO-004 regressions, two MDO-005 migration applications, and MDO-005 structural security verification. The behavioral proof then exposed a real PostgreSQL defect: `min(uuid)` does not exist in PostgreSQL 17.

The failure occurred while resolving the single governed MDO-004 acceptance event. It did not weaken or invalidate any authority, evidence, maturity, RLS, grant, or idempotency rule. No shared Supabase Test DDL had been performed.

Repair commit `2dcbee84ecaeeaf81f1348564c5e227437f78ad0` replaced only the unsupported UUID aggregate selector with ordered `array_agg(...)[1]` while retaining the exact `count(*) = 1` acceptance-event invariant.

Repaired exact-head MDO-005 run `41073086099` passed both jobs completely:

- server build and production dependency audit;
- deterministic MDO-005 service contract;
- accepted MDO service regressions;
- isolated PostgreSQL 17 setup;
- MDO-001 regression proof;
- MDO-004 structural and behavioral regression proof;
- MDO-005 migration applied twice;
- MDO-005 structural security proof;
- full MDO-005 maturity behavior proof.

On the same repaired head, returned repository-wide gates also passed for Implementation Integrity, Integrity Governance, CoMind Repository Configuration, No Placeholder Policy, DRB-002 Query Contract, broad CI, Runtime Budget Authority, Governed Provider Execution, Foundry Work Lease Kernel, Foundry Runtime Orchestration, Foundry Terminal Lifecycle, Live Foundry Stage 1 readiness, LF-2 readiness, LF-3 readiness, and Lane Health Sentinel. The bounded Foundry one-shot handoff was still running when this provenance update was written and remains an independent exact-head regression gate.

## Shared Supabase Test activation boundary

MDO-005 repository acceptance and shared Test activation are deliberately separate.

A fresh collision review found SEC-RLS-001 PR #396 active. Its current durable record states that shared Supabase Test mutation remains serialized behind the historical PR #119 boundary under Issue #126 and that even its own accepted RLS migration must not be applied until that boundary is reconciled or released.

Older Issue #126 comments recorded earlier reassignment and release events, so the durable records are not sufficiently unambiguous to infer that MDO-005 currently owns the shared Test mutation lease. MDO-005 therefore does not override the newer active-lane restriction.

No MDO-005 migration or maturity transition has been applied to canonical Supabase Test. The accepted persistent module consequently remains `conceived` until the shared mutation boundary is explicitly reconciled. This is a governance hold, not an implementation failure.

## Freshness and collisions

The branch was created only after RLIB-003R repaired the duplicate migration slot. MDO-005 uses migration slot `20261030_029` after confirming no existing repository match for that slot at branch creation.

The final pre-merge process must recheck current `main`, the `_029` namespace, open MDO and security lanes, and exact-head CI before merge.

## Recovery

Repository work is isolated to issue #407, branch `mdo-005-governed-module-maturity`, and one PR.

Database changes are additive. Failed isolated or Test acceptance is preserved as evidence and repaired forward. No destructive rollback of lifecycle or acceptance provenance is authorized.

## Successor boundary

After MDO-005 repository acceptance, the next candidate lifecycle gap is implementation activation. That successor must first establish a structured implementation work-package contract and explicit implementation authorization, while continuing to separate implementation execution, verification, integration acceptance, maturity advancement, operationalization, and Production authority.

Persistent Test implementation handoff must not treat the MDO Test module as `specified` until the deferred MDO-005 shared Test activation is actually completed and independently read back.