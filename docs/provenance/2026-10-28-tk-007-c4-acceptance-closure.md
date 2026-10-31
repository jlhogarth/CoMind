# TK-007 ThreadKeeper C4 Acceptance Closure

Date: 2026-10-28
Issue: #272
Lane: TK-007C / TK-007D
Environment: Supabase Test and isolated CI
Canonical maturity: C3 Integrated pending explicit acceptance
Target maturity: C4 Operational
Production activation: false

## Purpose

This record closes the technical evidence work after the TK-007 operational substrate and runtime-role repair. It does not itself promote ThreadKeeper. Canonical maturity remains C3 Integrated until explicit independent or Founder acceptance, a stale-state-guarded Canonical Development Evidence promotion, and post-promotion Maintenance Control are complete.

## Freshness and collision boundary

The acceptance-closure branch was created from `main` commit `5736a4cf470000974b976c4f91ee2f5b59255466`.

The accepted C4 runtime implementation and first successful bounded live Test proof are rooted at merge commit `a48baa290baef792d614c788961ab99966b3efac`. Comparison from that merge through the closure base showed 62 later commits and no ThreadKeeper-file overlap. Those intervening changes belonged to other active lanes and were preserved unchanged.

PR #287 merged the technical closure as `f9cae4cbe8fd499e91a505fb47c6764647fb76b9`.

ThreadKeeper does not claim an exclusive Supabase Test schema reservation. The closure work is repository-first and live proofs are bounded to ThreadKeeper-owned rows. Direct Test readback after the final live proof showed zero other active sessions, zero other open transactions, zero waiting locks, and zero `comind` relation locks. Conversation Ingestion remains unblocked.

## Initial retained live operational proof

GitHub Actions run `40594328128` completed successfully on `a48baa290baef792d614c788961ab99966b3efac`.

Workflow: `TK-007 ThreadKeeper C4 Operational`

- isolated operational proof: PASS;
- bounded live Supabase Test proof: PASS;
- artifact: `tk-007-c4-live-test`;
- artifact id: `12775328241`;
- artifact digest: `sha256:c36581451018c885f4e750c7efb47c10678742f4cf0f3bac6191635241b24e39`.

The governed external-evidence binding pins that run to its exact repository, workflow, event type, successful conclusion, and head SHA.

## Final technical acceptance runs

The exact PR tree at `ef110bf49e5ed6909c5daddeef5f6476d0474eab` passed:

- broad CI run `40790077208`: PASS;
- TK-007 C4 run `40790077310`: PASS;
- TK-004 persistence run `40790077220`: PASS;
- MCTRL run `40790077193`: PASS;
- TK-006 C3 regression run `40790077161`: PASS;
- TK-005 C2 evidence run `40790077207`: PASS.

The merged tree at `f9cae4cbe8fd499e91a505fb47c6764647fb76b9` passed:

- TK-004 persistence run `40790281313`: PASS;
- MCTRL run `40790281352`: PASS, including read-only live Supabase Test audit;
- TK-007 C4 Operational run `40790281404`: PASS, including both isolated proof and bounded live Supabase Test proof.

The PR head and merge commit have the same repository tree. The merge commit therefore adds merge history without changing the accepted content tree.

## Final live C4 artifact

Run `40790281404` preserved artifact `tk-007-c4-live-test`:

- artifact id: `12861905253`;
- artifact digest: `sha256:fc12f0dc63950d87b8571b2860edd12aca451ef5d92bce8a6cfbd3867cd93ba6`;
- run key: `40790281404-1`;
- environment: Test;
- production activation: false by workflow and canonical boundary.

The artifact reports cumulative health across both retained live scenarios because the operational health view is durable rather than run-local. At the time of the second run the cumulative health state was:

- operationCount: 12;
- succeeded: 8;
- failed: 2;
- blocked: 2;
- inFlight: 0;
- staleInFlight: 0;
- unrecoveredFailures: 0;
- health: healthy.

Run-local database reconciliation for `correlation:40790281404-1` isolates the second scenario correctly:

- operations: 6;
- succeeded: 4;
- failed: 1 controlled failure;
- blocked: 1 stale operation;
- in flight: 0;
- unrecovered failures: 0;
- last successful terminal operation: `2026-10-28T23:53:51.131Z`;
- artifact successful-operation p95: 550 ms;
- PostgreSQL interpolated p95 over the same four successful durations: 527.5 ms.

The differing p95 values reflect two valid small-sample quantile conventions. Neither is represented as a production SLO or throughput guarantee.

The run-local operation-event chain contains:

- STARTED: 6;
- SUCCEEDED: 4;
- FAILED: 1;
- BLOCKED: 1.

There is no false success and every started operation is terminal.

## Checkpoint and case reconciliation

The final live Test scope contains the expected two-checkpoint lineage:

1. root checkpoint `f174be4f-1d76-4972-81ea-d12b972ab5f1`;
2. successor checkpoint `62be786b-bec2-41c9-8dda-67a4d36b80dc`, whose parent is the root checkpoint.

Both were accepted through external authority reference `authority:tk-007:test-authorization` under `policy:tk-007:c4-test`.

The bounded continuity case `6200af4c-7119-48bc-94f0-2a00af97a1bb` reached terminal state `ACCEPTED_DIVERGENCE`. The accepted predecessor remains historically addressable.

The proof separately establishes stale-head rejection and restart/idempotency behavior. The retained failure is recovered through an explicitly linked successor recovery operation rather than deletion or history rewriting.

## Security and authority reconciliation

Direct Test readback after the final live proof confirms the runtime role still has the intended restricted attributes and access shape:

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

The historical persistence regression asserted that exactly five `cm_threadkeeper_*` tables existed. C4 intentionally added `cm_threadkeeper_operation_event`, producing a false regression failure after the runtime change was accepted.

TK-007C replaced the brittle table count with an explicit expected table set:

- `cm_threadkeeper_assessment`;
- `cm_threadkeeper_case`;
- `cm_threadkeeper_case_transition`;
- `cm_threadkeeper_checkpoint`;
- `cm_threadkeeper_operation_event`;
- `cm_threadkeeper_scope`.

The existing assertion that all governed ThreadKeeper tables have RLS enabled remains intact. Both the PR and main-branch TK-004 workflows now pass.

## Machine-readable C4 evidence gate

The C4 evidence gate is represented by `config/threadkeeper-c4-evidence.v1.json`, validated by `scripts/threadkeeper_c4_matrix.mjs`, and covered by fail-closed tests.

The pre-promotion matrix contains 28 requirements:

- 16 C4 gate requirements;
- 12 operational scenarios.

Final technical pre-promotion disposition after run binding:

- proven: 25;
- partial: 1;
- missing: 2;
- promotion ready: false.

The only unresolved requirements are now governance and post-promotion controls:

- C4-13: explicit independent reviewer or Founder acceptance;
- C4-14: canonical C3 to C4 promotion journal and entity update;
- C4-16: post-promotion Maintenance Control.

C4-11 is proven by immutable run bindings for broad CI, TK-004 persistence, MCTRL, and the complete main-branch C4 workflow. The validator still forbids a promotion-ready state while the remaining three gates are unresolved and forbids a promotion journal from appearing before readiness.

## Maintenance Control reconciliation

MCTRL run `40790281352` completed its isolated controls and read-only live Test audit successfully.

Preserved audit artifact:

- artifact id: `12861750583`;
- artifact digest: `sha256:0566a4f254c036cbf9d336358a7e43dd18ca85904280f3a3cb7de28c3366e822`;
- overall: PASS;
- PASS: 22;
- WARNING: 0;
- FAIL: 0.

The audit independently confirms the current pre-promotion canonical boundary:

- ThreadKeeper capability maturity: C3 Integrated;
- next gate: C4 Operational;
- existing C3 promotion journal: `JRN-20261027-0009`;
- production activation: false.

It also confirms schema expectations, graph consistency, RLS posture, orphan checks, C2/C3 journal verification, and maintenance research evidence without unexplained warnings or failures.

## Runtime and automation disposition

The existing GitHub Actions runtime is the bounded C4 operational proof mechanism:

- pull requests execute isolated PostgreSQL proof only;
- main-branch C4 changes execute the isolated proof before the bounded live Test proof;
- MCTRL performs a read-only Test audit after its isolated controls pass;
- live artifacts are retained for 30 days;
- live database evidence remains append-only and durable beyond artifact retention.

No recurring synthetic ThreadKeeper writer is added. A scheduled Test writer would create needless shared-environment mutation and collision risk for Conversation Ingestion without increasing C4 acceptance quality. Operational state remains reconstructable from durable ThreadKeeper event evidence and governed Maintenance Control.

## Remaining governed sequence

All technical pre-promotion evidence is complete. The remaining sequence is:

1. obtain explicit independent or Founder acceptance of ThreadKeeper TK-007 for C4 promotion;
2. query the then-current canonical Development Evidence state and journal sequence;
3. perform a stale-state-guarded C3 Integrated to C4 Operational promotion transaction;
4. preserve the new promotion journal and repository binding;
5. keep `production_activation=false`;
6. run post-promotion MCTRL and reconcile repository, canonical evidence, and projections;
7. close issue #272 only when the post-promotion control is clean.

## Production boundary

Nothing in TK-007C or TK-007D authorizes or performs production activation. C4 Operational in this lane means governed operational maturity demonstrated in Test with retained evidence. A future production activation requires its own explicit authorization and evidence-backed decision.
