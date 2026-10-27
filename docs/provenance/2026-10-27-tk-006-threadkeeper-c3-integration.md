# TK-006 ThreadKeeper C3 Integration Evidence

## Identity

- Issue: #256
- Pull request: #257
- Branch: `tk-006-c3-integration`
- Base at lane creation: `5e86005d3016824cefd3cc056fa7ad157ab1ce60`
- Governing capability contract: TK-001
- Governing implementation design: TK-002
- Accepted C2 implementation/evidence package: TK-005
- Current maturity: **C2 Implemented**
- Target maturity: **C3 Integrated**
- Production activation required: **false**
- Public HTTP endpoint required: **false**
- Operational SLA required: **false for C3**
- Automatic promotion: **forbidden**

## C3 integration decision

C3 is defined by TK-001 as verification of required cross-system interactions against real contracts. TK-006 therefore uses one bounded vertical slice rather than broad system wiring:

1. **Authoritative upstream:** certified and accepted Conversation History archive-checkpoint evidence exposed through the restricted `comind_conversation_history_reader` role.
2. **Continuity core:** ThreadKeeper service, persistence, assessment, checkpoint, lineage, and observability contracts accepted at C2.
3. **Governed downstream:** the existing `ContinuityHandoffEnvelope`, which explicitly requires independent downstream authority validation.

This proves integration without turning ThreadKeeper into a conversation archive, transport layer, task executor, memory store, or truth authority.

## Implementation strategy

The integration layer is reference-first and authority-preserving:

- Conversation History evidence includes only stable IDs, accepted checkpoint/import identity, hashes, classification/presence state, and timestamps.
- Raw conversation JSON, message text, titles, attachments, and arbitrary user content are not selected into the ThreadKeeper adapter.
- The Conversation History query must already execute as `comind_conversation_history_reader`; ThreadKeeper does not receive a privileged archive connection.
- ThreadKeeper and Conversation History retain separate PostgreSQL sessions and role boundaries.
- Checkpoint acceptance still requires valid external authority.
- Downstream handoff still reports `requires_independent_validation` and grants no inherited execution authority.
- C3 integration metrics are categorical and numeric only; they accept no raw evidence labels.

Frozen C3 runtime implementation commit: `665d52b7d92f89e98aec0cfb5210b9fed6e8aa8c`.

## Executed isolated evidence

GitHub Actions run `40562386747` passed the isolated PostgreSQL C3 proof. The executable suites establish:

- 7 C3 evidence-contract tests passing;
- 5 C3 service/reference/privacy tests passing;
- 1 PostgreSQL real-contract vertical-slice integration test passing;
- certified baseline A can establish a checkpoint only with external authority;
- accepted unchanged differential U is INTACT/idempotent and does not create duplicate authoritative continuity;
- accepted changed differential B is detected as a continuity change and, after external authorization, is accepted as A's successor with lineage preserved;
- downstream stale A is rejected while current B resolves with complete lineage;
- uncertified evidence remains invisible;
- resolver outage remains unverifiable/fail-closed;
- restart preserves accepted state and lineage;
- raw transcript/title canaries never enter ThreadKeeper persistence or C3 metrics.

The aggregate-CI harness initially exposed a unit-test configuration coupling: importing the C3 service path caused the existing C2 repository module to parse global database configuration even though that test performs no database I/O. Runtime code was not reopened. The service test now supplies an unreachable loopback database sentinel before dynamic import; any accidental database access therefore fails closed. Commit `fed3066b74ec09d18e24b372a4f3e0e6076aea38`. Aggregate CI then passed on run `40567724781`.

## Supabase Test boundary

Migration `threadkeeper_c3_history_read_boundary` was applied to CoMind Test project `sbgfuanxiqepcoboxzcl` only after isolated proof passed.

Independent Test verification established:

- `comind_conversation_history_reader` has SELECT on the accepted archive-checkpoint and snapshot-membership control tables required by the adapter;
- INSERT, UPDATE, and DELETE remain denied;
- RLS remains enabled and forced on both control tables;
- the intended reader policies are present;
- an actual `SET LOCAL ROLE comind_conversation_history_reader` read sees zero accepted checkpoints and zero snapshot rows because no certified real baseline exists yet;
- Test contains zero certified Conversation History baselines, zero archive streams, and zero accepted archive checkpoints;
- pre-existing ThreadKeeper Test state remains 1 scope / 2 checkpoints and was not mutated;
- no synthetic shared Test baseline or private native export was manufactured for C3.

This bounded Test proof is recorded by CDE event `JRN-20261027-0007`. A real native baseline remains a future operational input, not a prerequisite for C3 integration maturity.

## Freshness reconciliation

While TK-006 was open, `main` advanced through accepted RCO-001 work to `54505b066faa5984dee6208504feed6cb40a609f`.

The RCO change set was audited before reconciliation and had zero overlap with TK-006 changed files. A two-parent freshness merge was constructed as `9de1ddbad359b3cc4b1673a908f2704f47bc22c9`, preserving both the fully green TK-006 lineage and current RCO-001 main without rebasing or rewriting either lane.

On that freshness-reconciled head:

- CI run `40568980146`: PASS;
- TK-006 C3 run `40568980282`: PASS;
- TK-005 C2 evidence run `40568980171`: PASS;
- TK-004 persistence run `40568980089`: PASS;
- MCTRL run `40568980164`: PASS;
- repository configuration, no-placeholder, Foundry runtime, work-lease, terminal-lifecycle, provider, and readiness gates also passed.

## Governed projection reconciliation

CDE event `JRN-20261027-0008` records the pre-promotion reconciliation. The canonical fact remains **C2 Implemented** while C3 technical evidence is proven.

Reconciled projections:

- CCI-001 v0.7: C2 remains canonical; TK-006 technical C3 evidence staged;
- MLC-001 v0.4: ThreadKeeper remains a Capability, module lifecycle N/A, C3 target governance-gated;
- DPE-001 v0.5: formula recomputation places ThreadKeeper at **79.1 / P1** during the active C3 acceptance gate;
- DPE-002 v0.2: topology remains 44 active typed edges, 41 priority-weighted edges, 1 retired stale edge, 10 quarantined candidates;
- EDG-001 v0.2: reviewed with no new/retired relationship required; topology unchanged.

The 79.1/P1 value is the current formula result, not a manually chosen score. The prior 80.1/P0 value remains historical to the post-C2 state.

## Hardened maintenance-control evidence

C3 acceptance exposed a durability gap: MCTRL validated the accepted C2 evidence contract but did not yet directly validate the C3 matrix. TK-006 therefore extended `.github/workflows/mctrl-001-maintenance-control.yml` to trigger on C3 evidence surfaces and to execute:

- `scripts/threadkeeper_c3_matrix.mjs`;
- `server/test/threadkeeper-c3-evidence.test.mjs`.

MCTRL run `40569736198` passed on head `f36db53f2edd2f83e9fa19f62b8198d863f59c5a`. Its maintenance-control job explicitly passed both new C3 steps as well as the existing C2 evidence validation/fail-closed tests. This is the evidence bound to C3-16.

## Current evidence matrix state

`config/threadkeeper-c3-evidence.v1.json` contains 29 governed items:

- 17 formal C3 gate requirements;
- 12 end-to-end integration scenarios.

Pre-promotion state after C3-16 closure:

- proven: **28**;
- partial: **0**;
- missing: **1**;
- unresolved: **C3-17 only**;
- canonical maturity: **C2 Implemented**;
- promotion ready: **false**.

C3-17 is intentionally unresolved until the explicit maturity-promotion journal is appended.

## Adjacent-system boundaries

TK-006 does not move authority into ThreadKeeper:

- Conversation History retains raw event/archive ownership and mutation authority.
- Agent Communication retains transport/routing/addressing ownership.
- Foundry retains execution, lease, retry, fencing, and outcome authority.
- Helper Matrix recommendations do not execute helpers.
- SEAL recommendations do not execute revisions.
- Memory Graph remains the durable memory store.
- EIK retains epistemic/truth authority.
- Digital Twin identity remains outside ThreadKeeper.
- ACP remains a separate continuity/recovery substrate.

## Promotion rule

The sequence remains fail-closed:

1. prove the real-contract vertical slice on an exact repository head;
2. close replay/degraded/privacy/authority scenarios;
3. verify bounded Supabase Test contracts without loading synthetic shared source evidence;
4. freeze the exact C3 implementation head;
5. freshness-reconcile concurrent main work without overwriting another lane;
6. reconcile Canonical Development Evidence and governed projections while keeping C2 canonical;
7. harden and pass post-change MCTRL with both C2 and C3 evidence contracts enforced;
8. only if the final pre-promotion head remains current and green, append the explicit C2 Implemented -> C3 Integrated promotion journal;
9. update the matrix to promotion-ready C3 and rerun exact-head gates;
10. merge only while the verified head remains current;
11. require post-merge main MCTRL and bounded live Test audit before acceptance closure.

No single test, commit, migration, document, or projection is sufficient to establish C3 by itself. Production activation remains false and C4 Operational is a separate future gate.
