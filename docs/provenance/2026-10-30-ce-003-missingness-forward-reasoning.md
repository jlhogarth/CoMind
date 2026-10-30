# CE-003 Missingness and Forward Reasoning Scan Evidence

Date: 2026-10-30
Issue: #364
Branch: `ce-003-missingness-forward-reasoning`
Environment: Test-first
Production activated: false
Paid provider used: false

## Objective

Implement the approved Continuous Excellence Missingness Scan as a deterministic, proportionate, evidence-bearing evaluator that surfaces material omissions and forward consequences before consequential action without creating a parallel decision, evidence, task, recovery, or orchestration platform.

## Authoritative starting state

The lane was initially leased from fresh `main` at:

`e6e8cd50365542110218c790623a5bde833a353e`

That commit is the merged CE-002 Recovery and Reorientation Protocol baseline from PR #345.

The controlling issue is:

https://github.com/jlhogarth/CoMind/issues/364

## Freshness reconciliation before PR

While CE-003 implementation was in progress, HOME-001 merged and `main` advanced to:

`73c69419535b6901f84b158f8a1dff7c242b1244`

The HOME-001 merge message explicitly records an information-architecture/source-authority contract with no Console UI, database schema, authentication, deployment-policy, or Production activation change.

A compare from current `main` to the CE-003 branch showed:

- branch behind by 11 commits before reconciliation;
- exactly six CE-003 changed files;
- every CE-003 changed file additive;
- no overlap with the accepted HOME-001 paths.

The same CE-003 branch was re-anchored through merge-style commit:

`eefff8be0791294d2e74fe1599d0739871180811`

Its first parent is current `main` `73c69419535b6901f84b158f8a1dff7c242b1244`; its second parent preserves the full pre-reconciliation CE-003 history at `56eaf72c5cab7ab11f7195edb70649a073b48b22`.

Post-reconciliation compare reports `behind_by=0` and still only the six CE-003 additive files. No force rewrite was used.

## Reuse analysis

CE-003 deliberately introduces no database table.

Accepted substrates reused:

- CE-001 `comind.cm_ce_signal` and `comind.record_ce_signal(...)` already support `missingness` and `opportunity` signal types plus project-scoped idempotency;
- CE-002 already owns recovery/reorientation and authoritative-state reconciliation after interruption;
- Durable RunBook remains operational chronology;
- `comind.cm_project`, `comind.cm_task`, and `comind.cm_evidence` remain canonical work/evidence identities;
- ThreadKeeper and ACP retain continuity ownership;
- MDO retains planning/execution ownership;
- existing authority ceilings remain controlling.

The identified capability gap is the deterministic scan/evaluation layer and its narrow persistence adapter.

## Collision analysis

Active modern lanes were checked before implementation.

### MDO-002 PR #334

Current changed paths are MDO workflow, migration/verifier, provenance, MDO planning runtime, scripts, and MDO tests. It does not own `server/src/continuous-excellence/` or CE-003-specific test/workflow/documentation paths.

### IIC-005 PR #357

Current changed paths are Implementation Integrity workflow/registry/scanner/tests/documentation. CE-003 does not alter those control semantics or files.

### VE-STD-001 PR #355

Current delta is `docs/governance/VE-ENGINEERING-STANDARD-v0.1.md`. CE-003 does not modify that standard.

Result: no material ownership collision was found for the selected CE-003 slice.

## Durable lane registration

Canonical CoMind identities established in Supabase Test:

- project: `8ac9fab3-35df-48fb-b1df-95285fee9dc0`
- CE-003 task: `81ff42c5-0233-46c8-abc4-197ad5a1dad0`
- RunBook project: `ff0189b5-6733-4ef9-b6ed-e9729c3cd54f`
- RunBook work item: `d68b15b1-6660-4bc1-8934-04b684f5363c`
- Continuity Capsule v1: `31aaf2ca-4f57-4cf6-8498-c3b802d3d7b6`

Initial durable state:

- canonical task: `in_progress`
- RunBook: `in_progress`
- Capsule: `ready / verified`
- no Production activation
- no paid provider authorization

## Registration failures preserved

Two initial registration transactions failed atomically and created no partial CE-003 ledger state.

### Failure 1: Capsule function arity mismatch

The first transaction passed one extra JSON argument to the existing `comind.capture_ce_continuity_capsule(...)` function. PostgreSQL rejected the call with function-resolution error `42883`.

Correction:

- inspect the live function signature;
- preserve the accepted function contract;
- remove the extra argument;
- retry idempotently.

No function was weakened or changed.

### Failure 2: RunBook visibility inside sibling data-modifying CTEs

The second transaction attempted task/work/evidence creation through sibling data-modifying CTEs and invoked `comind_pm.record_runbook_event(...)` in the same statement. PostgreSQL does not guarantee the execution order needed for the RunBook function to observe the newly inserted work item. The RunBook correctly rejected the call with:

`Unknown work_key CE-003 for project COMIND`

Correction:

- preserve the RunBook fail-closed constraint;
- use explicit sequential statements inside one transaction;
- create task/work identity first;
- append evidence, RunBook event, and Capsule only after identity is visible.

The sequential transaction succeeded and readback confirmed the CE-003 task, RunBook item, and Capsule v1.

## Implementation

### Deterministic scanner

`server/src/continuous-excellence/missingness.ts`

Implements:

- sixteen approved scan dimensions;
- consequence levels `low`, `moderate`, `high`, `critical`;
- proportionate required-dimension policy;
- explicit authority state;
- structured dependency, assumption, adjacent-system, commitment, reuse, and opportunity inputs;
- stable material finding codes;
- blocking and nonblocking findings;
- deterministic SHA-256 scan and finding fingerprints;
- stable result ordering independent of equivalent input ordering;
- result decisions `proceed`, `proceed_with_attention`, and `blocked`;
- read-only evaluation;
- separate persistence adapter that recomputes the scan before writing;
- CE-001 signal idempotency reuse;
- no direct CE history UPDATE or DELETE path.

### Focused deterministic tests

`server/test/ce-003-missingness-forward-reasoning.test.mjs`

Covers:

- low-consequence proportionality;
- complete high-consequence state with no false blocker;
- unknown authority;
- explicit approval boundary;
- rollback/recovery gap;
- weak unsupported assumption;
- unavailable required dependency;
- unresolved adjacent-system impact/ownership;
- missing testing/acceptance evidence;
- required dimension with missing provenance;
- costly/hard-to-reverse optionality;
- reuse-before-reinvention;
- low-cost option preservation;
- stable fingerprints across equivalent input order;
- contradictory structured input rejection;
- persistence replay idempotency;
- tampered-result rejection.

### PostgreSQL integration proof

`server/test/integration/ce-003-missingness-persistence.e2e.mjs`

Uses isolated PostgreSQL 17 and the accepted CE-001 schema/function to prove:

- a material CE-003 finding persists through `comind.record_ce_signal(...)`;
- signal type, severity, provenance, and details are correct;
- replay returns the same signal identity;
- the project/idempotency invariant leaves exactly one durable signal row;
- the proof runs inside a transaction and rolls back synthetic data.

No CE-003 migration is required.

## Local execution limitation

The local working container could not resolve `github.com` while attempting to obtain an independent repository checkout:

`fatal: Could not resolve host: github.com`

This is an execution-environment networking limitation, not evidence that the CE-003 implementation passed or failed.

Consequences:

- no local clone/build claim is made;
- exact-head GitHub Actions is the authoritative compiler/test gate;
- a real PostgreSQL integration test is included so database persistence is not accepted solely from mocked SQL.

## Architecture boundary

`docs/architecture/ce-003-missingness-forward-reasoning.md` records the deterministic input contract, proportionality policy, finding semantics, persistence boundary, CE-002 relationship, RunBook boundary, authority model, acceptance strategy, and recovery model.

## Acceptance required before review readiness

The PR must remain draft until the exact candidate proves:

- exact-head checkout identity;
- dependency audit;
- TypeScript build;
- focused CE-003 deterministic tests;
- real PostgreSQL 17 CE-001 signal persistence/replay proof;
- full server regression suite;
- No Placeholder;
- Implementation Integrity;
- relevant broad repository/continuity regressions;
- final freshness/collision review.

Any failure is evidence. Repair the actual failing abstraction boundary and preserve the failure rather than weakening the governing control.

## Authority boundary

CE-003 may identify, recommend, or block based on supplied evidence. It does not grant authority, execute Production actions, call a paid provider, merge itself, deploy itself, or replace the human acceptance boundary.

No Hallucinations. No Lies. No silent delegated work.
