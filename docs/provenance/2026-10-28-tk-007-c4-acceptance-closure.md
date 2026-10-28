# TK-007 ThreadKeeper C4 Acceptance Closure

Date: 2026-10-28
Issue: #272
Lane: TK-007C
Environment: Supabase Test and isolated CI
Canonical maturity at start: C3 Integrated
Target maturity: C4 Operational
Production activation: false

## Purpose

This record closes the remaining technical evidence gaps after the TK-007 operational substrate and runtime-role repair. It does not itself promote ThreadKeeper. Canonical maturity remains C3 Integrated until exact-head closure checks, explicit independent or Founder acceptance, a stale-state-guarded Canonical Development Evidence promotion, and post-promotion Maintenance Control are all complete.

## Freshness and collision boundary

The acceptance-closure branch was created from current `main` commit `5736a4cf470000974b976c4f91ee2f5b59255466`.

The accepted C4 runtime implementation and successful bounded live Test proof are rooted at merge commit `a48baa290baef792d614c788961ab99966b3efac`. Comparison from that merge through the closure base showed 62 later commits and no ThreadKeeper-file overlap. Those intervening changes belong to other active lanes and are preserved unchanged.

ThreadKeeper does not claim an exclusive Supabase Test schema reservation. The closure work is repository-first and the post-merge live proof is bounded to ThreadKeeper-owned rows. A direct Test readback immediately before opening the closure PR showed zero other active sessions, zero other open transactions, zero waiting locks, and zero `comind` relation locks. Conversation Ingestion remains unblocked.

## Retained live operational proof

GitHub Actions run `40594328128` completed successfully on `a48baa290baef792d614c788961ab99966b3efac`.

Workflow: `TK-007 ThreadKeeper C4 Operational`

- isolated operational proof: PASS;
- bounded live Supabase Test proof: PASS;
- artifact: `tk-007-c4-live-test`;
- artifact id: `12775328241`;
- artifact digest: `sha256:c36581451018c885f4e750c7efb47c10678742f4cf0f3bac6191635241b24e39`.

The governed external-evidence binding now pins that run to its exact repository, workflow, event type, successful conclusion, and head SHA. The binding is implementation evidence only. It does not fabricate a final acceptance run or promotion journal.

## Artifact and database reconciliation

The retained artifact and direct Supabase Test readback reconcile to the same bounded scenario.

Operational summary:

- operations: 6;
- succeeded: 4;
- failed: 1 controlled evidence-resolver failure;
- blocked: 1 stale operation;
- in flight: 0;
- stale in flight: 0;
- unrecovered failures: 0;
- last successful terminal operation: `2026-10-27T22:24:21.767Z`;
- artifact successful-operation p95: 550 ms;
- PostgreSQL interpolated p95 over the same four successful durations: 527.5 ms.

The differing p95 values reflect two valid small-sample quantile conventions. Neither is represented as a production SLO or throughput guarantee.

The operation-event chain contains:

- STARTED: 6;
- SUCCEEDED: 4;
- FAILED: 1;
- BLOCKED: 1.

There is no false success and every started operation is terminal.

## Checkpoint and case reconciliation

The live Test scope contains the expected two-checkpoint lineage:

1. root checkpoint `b6b84a41-4a15-49f6-9403-534a15a28e4d`;
2. successor checkpoint `7cde288f-db6c-4650-90c5-ec55d8a1fc4e`, whose parent is the root checkpoint.

Both were accepted through external authority reference `authority:tk-007:test-authorization` under `policy:tk-007:c4-test`.

The bounded continuity case `de574c6c-ecc4-4b3d-bbce-cd19318fe339` reached terminal state `ACCEPTED_DIVERGENCE`. The accepted predecessor remains historically addressable.

The proof separately establishes stale-head rejection and restart/idempotency behavior. The retained failure is recovered through an explicitly linked successor recovery operation rather than deletion or history rewriting.

## Security and authority reconciliation

Direct Test readback confirms the runtime role still has the intended restricted attributes and access shape:

- role attributes satisfy NOLOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, and NOREPLICATION;
- operation-event SELECT: allowed;
- operation-event INSERT: allowed;
- operation-event UPDATE: denied;
- operation-event DELETE: denied;
- archive-source SELECT: denied;
- anonymous operation-event SELECT: denied;
- authenticated operation-event SELECT: denied.

The live proof also rejects ThreadKeeper self-authority. The runtime repair uses explicit transaction-local role assumption and fails closed rather than falling back to the broader session identity.

## TK-004 regression repair

The historical persistence regression still asserted that exactly five `cm_threadkeeper_*` tables existed. C4 intentionally added `cm_threadkeeper_operation_event`, producing a false regression failure after the runtime change was accepted.

TK-007C replaces the brittle table count with an explicit expected table set:

- `cm_threadkeeper_assessment`;
- `cm_threadkeeper_case`;
- `cm_threadkeeper_case_transition`;
- `cm_threadkeeper_checkpoint`;
- `cm_threadkeeper_operation_event`;
- `cm_threadkeeper_scope`.

The existing assertion that all governed ThreadKeeper tables have RLS enabled is preserved.

## Machine-readable C4 evidence gate

TK-007C adds `config/threadkeeper-c4-evidence.v1.json` and `scripts/threadkeeper_c4_matrix.mjs`, plus fail-closed tests.

The pre-promotion matrix contains 28 requirements:

- 16 C4 gate requirements;
- 12 operational scenarios.

Current pre-promotion disposition:

- proven: 24;
- partial: 2;
- missing: 2;
- promotion ready: false.

The only unresolved gates are deliberately procedural and post-proof:

- C4-11: exact-head acceptance-closure CI, TK-004, C4 and MCTRL evidence;
- C4-13: explicit independent reviewer or Founder acceptance;
- C4-14: canonical C3 to C4 promotion journal and entity update;
- C4-16: post-promotion Maintenance Control.

The validator forbids a promotion-ready state while any of those remain unresolved. It also forbids a promotion journal from appearing before readiness.

## Maintenance Control integration

MCTRL now treats the C4 matrix, validator, workflow, and governed run binding as first-class maintenance inputs. It verifies the retained GitHub run against live GitHub facts and executes the C4 fail-closed matrix tests alongside the accepted C2 and C3 controls.

The shared evidence verifier was also generalized so final lane-workflow recognition follows the lane key rather than assuming every lane after TK-005 is TK-006. This preserves current C2/C3 behavior and allows TK-007 and later governed lanes to use the same acceptance mechanism.

## Runtime and automation disposition

The existing GitHub Actions runtime remains the correct bounded C4 operational proof mechanism:

- pull requests execute isolated PostgreSQL proof only;
- main-branch C4 changes execute the isolated proof before the bounded live Test proof;
- MCTRL performs a read-only Test audit after its isolated controls pass;
- live artifacts are retained for 30 days;
- live database evidence remains append-only and durable beyond artifact retention.

No recurring synthetic ThreadKeeper writer is added. A scheduled Test writer would create needless shared-environment mutation and collision risk for Conversation Ingestion without increasing C4 acceptance quality. Operational monitoring is reconstructable from durable ThreadKeeper event state and governed Maintenance Control rather than a parallel polling subsystem.

## Remaining sequence

1. Open the TK-007C closure pull request from the current branch.
2. Require exact-head TK-007 C4, TK-004 persistence, broad CI, and MCTRL success.
3. Reconcile any failure without weakening the fail-closed boundary.
4. Record the exact final acceptance runs in the C4 matrix and governed bindings.
5. Obtain explicit independent or Founder C4 acceptance.
6. Only after acceptance, perform the stale-state-guarded Canonical Development Evidence promotion from C3 Integrated to C4 Operational.
7. Keep `production_activation=false`.
8. Run post-promotion MCTRL and reconcile repository, canonical evidence, and projections before closing #272.

## Production boundary

Nothing in TK-007C authorizes or performs production activation. C4 Operational in this lane means governed operational maturity demonstrated in Test with retained evidence. A future production activation requires its own explicit authorization and evidence-backed decision.
