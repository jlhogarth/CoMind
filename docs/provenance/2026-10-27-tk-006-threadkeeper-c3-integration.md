# TK-006 ThreadKeeper C3 Integration Evidence

## Identity and accepted result

- Issue: #256
- Pull request: #257
- Branch: `tk-006-c3-integration`
- Governing capability contract: TK-001
- Governing implementation design: TK-002
- Accepted C2 package: TK-005
- Accepted maturity: **C3 Integrated**
- Promotion journal: `JRN-20261027-0009`
- Final PR head: `ad9605db192761ee80cc48ba3b733e5079e15160`
- Merge commit: `60c7a070699585f0b005a16ff7f0dd56b3ef6179`
- Next maturity gate: **C4 Operational**
- Production activation: **false**
- Public HTTP endpoint required for C3: **false**
- Operational SLA required for C3: **false**
- Automatic promotion: **forbidden**

TK-006 establishes a bounded real-contract integration slice from certified Conversation History evidence through ThreadKeeper to the existing governed continuity-handoff consumer. It does not activate production or transfer authority from adjacent systems.

## Integration architecture

1. **Authoritative upstream:** certified and accepted Conversation History checkpoint/snapshot evidence through the restricted `comind_conversation_history_reader` role.
2. **Continuity core:** ThreadKeeper service, persistence, assessment, checkpoint, lineage, and observability contracts accepted at C2.
3. **Governed downstream:** the existing `ContinuityHandoffEnvelope`, which requires independent downstream authority validation.

The adapter is reference-first. It selects stable IDs, accepted checkpoint/import identity, hashes, classification/presence state, and timestamps. Raw conversation JSON, message text, private titles, attachments, and arbitrary user content are not copied into ThreadKeeper. Conversation History and ThreadKeeper retain separate database sessions and authority boundaries. Checkpoint acceptance still requires external authority, and downstream execution authority is never inherited.

Frozen C3 runtime implementation commit: `665d52b7d92f89e98aec0cfb5210b9fed6e8aa8c`.

## Isolated implementation evidence

GitHub Actions run `40562386747` passed the isolated PostgreSQL C3 proof on the frozen implementation commit. It established:

- C3 evidence-contract validation and fail-closed behavior;
- service/reference/privacy tests;
- real-contract PostgreSQL vertical-slice integration;
- externally authorized initial checkpoint acceptance;
- idempotent replay of unchanged certified evidence;
- changed-source detection and predecessor lineage preservation;
- stale downstream checkpoint rejection;
- current downstream handoff with complete lineage;
- uncertified evidence invisibility;
- resolver outage as unverifiable and fail-closed;
- restart durability;
- raw transcript and title canaries excluded from ThreadKeeper state and metrics.

The aggregate CI harness exposed one test-only configuration coupling. Runtime code was not reopened. The C3 service unit test supplies an unreachable loopback database sentinel before dynamic import so accidental database access fails closed. Commit `fed3066b74ec09d18e24b372a4f3e0e6076aea38`.

## Supabase Test boundary

Migration `threadkeeper_c3_history_read_boundary` was applied to CoMind Test only after isolated proof passed.

Verification established:

- the Conversation History reader has SELECT only on the accepted checkpoint and snapshot-membership control tables required by the adapter;
- INSERT, UPDATE, and DELETE remain denied;
- RLS remains enabled and forced on those control tables;
- the intended reader policies are present;
- an actual reader-role session sees zero accepted checkpoints and zero snapshot rows because no certified native baseline exists yet;
- Test contains zero certified Conversation History baselines, zero archive streams, and zero accepted archive checkpoints;
- pre-existing ThreadKeeper Test state was not mutated;
- no synthetic shared Test baseline or private native export was manufactured for C3.

This bounded Test proof is recorded by `JRN-20261027-0007`. A real native baseline remains a future operational input, not a prerequisite for C3 integration maturity.

## Freshness and neighboring-lane protection

While TK-006 was open, `main` advanced through accepted RCO-001 work to `54505b066faa5984dee6208504feed6cb40a609f`. The RCO change set had zero overlap with TK-006 changed files. Two-parent freshness merge `9de1ddbad359b3cc4b1673a908f2704f47bc22c9` preserved both lineages without rewriting either lane.

TK-006 preserves these ownership boundaries:

- Conversation History retains archive and event ownership and mutation authority.
- Agent Communication retains transport, routing, and addressing ownership.
- Foundry retains execution, lease, retry, fencing, and outcome authority.
- Helper Matrix recommendations do not execute helpers.
- SEAL recommendations do not execute revisions.
- Memory Graph remains separate durable memory authority.
- EIK retains epistemic and truth authority.
- Digital Twin identity remains outside ThreadKeeper.
- ACP remains a distinct continuity and recovery substrate.

No CHIST-K01 retrieval schema or implementation was modified by TK-006.

## Pre-promotion projection reconciliation

`JRN-20261027-0008` recorded the governed pre-promotion state. At that point C2 remained canonical while C3 technical integration was proven.

Staging projections were:

- CCI-001 v0.7;
- MLC-001 v0.4;
- DPE-001 v0.5;
- DPE-002 v0.2;
- EDG-001 v0.2.

DPE recomputed ThreadKeeper at **79.1 / P1**. That value was formula-derived, not manually selected. Dependency topology remained 44 active typed edges, 41 priority-weighted edges, 1 retired stale edge, and 10 quarantined candidates.

## Late regression and fixture hardening

A late pre-promotion regression wave correctly blocked promotion when TK-004 run `40570074244` failed in `threadkeeper-competitive-proofs.integration.test.mjs` with `stale_checkpoint`. The preceding ThreadKeeper migration, idempotence, scope-integrity, foreign-key indexing, immutability, concurrency, C2 gap, repository, and service assertions had passed.

Inspection found the test fixture used `process.pid` as part of durable semantic scope and proof identity. Short-lived Node processes may reuse a PID, allowing a fixture to alias older proof state in the same isolated database. Commit `21919df154366872ee76e47bae3110d1803a1c72` replaced that identity source with a cryptographically random `randomUUID()` per proof invocation and used it consistently across the semantic scope, proposals, observation, assessment, case, and transition keys. This did not weaken stale-state rejection or alter ThreadKeeper runtime behavior.

After the repair and subsequent freshness and evidence reconciliation, exact pre-promotion head `c3b28bc4d69df0b092edfdd299e83ab92a43837d` passed:

- MCTRL: `40569816447`;
- TK-006: `40569816435`;
- TK-004: `40569816147`;
- CI: `40569816123`, with terminal check-runs and no failure conclusions.

## Explicit C2 to C3 promotion

After the exact pre-promotion gates passed, the canonical promotion was executed as one Test database transaction with stale-state preconditions on ThreadKeeper, TK-006, CCI, MLC, and DPE versions. The transaction would fail rather than promote from an unexpected concurrent state.

`JRN-20261027-0009` records:

- `C2 Implemented` to `C3 Integrated`;
- result `PASS`;
- verification state `verified`;
- issue #256 and PR #257;
- implementation commit `665d52b7d92f89e98aec0cfb5210b9fed6e8aa8c`;
- pre-promotion accepted head `c3b28bc4d69df0b092edfdd299e83ab92a43837d`;
- production activation `false`;
- C4 Operational as a separate future gate.

Canonical state after the transaction:

- `concept:threadkeeper` version 6, C3 Integrated;
- `TK-006` version 3, complete;
- CCI-001 v0.8;
- MLC-001 v0.5;
- DPE-001 v0.6;
- DPE-002 v0.2, topology unchanged;
- EDG-001 v0.2, topology unchanged.

The Drive projections were refreshed and read back. CCI v0.8 and MLC v0.5 state C3 Integrated. DPE v0.6 preserved the formula-driven 79.1/P1 score while issue #256 remained open for merge closure. DPE-002 retained v0.2 because topology did not change. EDG retained v0.2 because TK-006 changed no documentation-graph relationship.

## Accepted C3 maintenance-control proof

Repository commit `985fb5e52b5987baf9b5f61a7257c0858394a71b` reconciled `config/maintenance-control.v1.json` to the accepted C3 canonical and projection state.

MCTRL run `40571223848` passed on that exact commit. Its maintenance-control job passed:

- build;
- maintenance-control unit tests;
- isolated maintenance-control integration tests;
- ThreadKeeper C2 evidence validation;
- C2 fail-closed evidence tests;
- ThreadKeeper C3 evidence validation;
- C3 fail-closed evidence tests.

This established an independent accepted-C3 maintenance proof before final PR closure.

## Final exact-head acceptance and merge

The final evidence and fixture reconciliation produced exact PR head:

`ad9605db192761ee80cc48ba3b733e5079e15160`

The final exact-head acceptance sweep included:

- TK-006 ThreadKeeper C3 Integration `40572027624`: PASS
- MCTRL-001 Maintenance Control `40572027441`: PASS
- TK-004 ThreadKeeper Persistence: PASS
- CI: PASS
- TK-005 C2 evidence regression: PASS
- applicable repository regression gates: PASS

PR #257 then merged as `60c7a070699585f0b005a16ff7f0dd56b3ef6179`. Later DPE closure reconciliation advanced planning evidence without changing the accepted C3 runtime implementation, maturity, authority boundaries, or production activation state.

## Final evidence matrix state

`config/threadkeeper-c3-evidence.v1.json` governs 29 items: 17 formal C3 gate requirements and 12 end-to-end scenarios.

Final accepted state:

- proven: **29**;
- partial: **0**;
- missing: **0**;
- canonical maturity: **C3 Integrated**;
- promotion ready: **true**.

## EVID-001 external evidence hardening

A later review of TK-005 identified that the original matrix-validator pattern verified repository evidence strongly but treated GitHub run IDs and CDE keys too syntactically. TK-006 had inherited that validator pattern, even though its actual final evidence was independently present and green.

Issue #261, EVID-001, corrects the shared governance pattern without reopening the accepted C3 runtime implementation:

- immutable external run facts are maintained separately in `config/governed-evidence-bindings.v1.json`;
- implementation run `40562386747` is bound to exact implementation commit `665d52b7d92f89e98aec0cfb5210b9fed6e8aa8c`;
- final acceptance is bound to TK-006 run `40572027624` and MCTRL run `40572027441` on exact head `ad9605db192761ee80cc48ba3b733e5079e15160`;
- CI verifies bound GitHub runs live using read-only Actions authority and checks repository, completed state, successful conclusion, exact head SHA, workflow identity, and event type;
- MCTRL verifies canonical CDE records `JRN-20261027-0007`, `JRN-20261027-0008`, and `JRN-20261027-0009` directly against Test Canonical Development Evidence with required `verification_state=verified`;
- fabricated positive run IDs, wrong-head runs, failed runs, wrong workflow or event bindings, and fabricated non-empty CDE keys fail closed;
- implementation commit ancestry is verified from full Git history in CI.

The canonical Test database was read during EVID-001 review and all four ThreadKeeper journals checked by the hardened controls, including the historical C2 promotion journal, were present with `verification_state=verified`.

EVID-001 strengthens how the accepted C3 result is machine-verified. It does not change ThreadKeeper runtime behavior, re-promote C3, activate production, or expand authority.

## C4 boundary

C3 does not establish operational maturity. C4 Operational is a separate future gate requiring target-environment evidence for sustained runtime behavior, observability, governance, failure and recovery characteristics, and objective acceptance criteria. Production activation remains a separately governed decision.
