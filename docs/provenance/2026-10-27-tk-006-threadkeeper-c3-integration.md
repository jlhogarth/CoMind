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

1. **Authoritative upstream:** certified Conversation History evidence exposed through the existing `comind_conversation_history_reader` role and baseline-certification boundary.
2. **Continuity core:** ThreadKeeper service, persistence, assessment, checkpoint, lineage, and observability contracts accepted at C2.
3. **Governed downstream:** the existing `ContinuityHandoffEnvelope`, which explicitly requires independent downstream authority validation.

This proves integration without turning ThreadKeeper into a conversation archive, transport layer, task executor, memory store, or truth authority.

## Implementation strategy

The new integration layer is reference-first and authority-preserving:

- Conversation History summary evidence includes only stable IDs, certification/import identity, hashes, counts, and timestamps.
- Raw conversation JSON, message text, titles, attachments, and arbitrary user content are not selected into the ThreadKeeper adapter.
- The Conversation History query must already execute as `comind_conversation_history_reader`; ThreadKeeper does not receive a privileged archive connection.
- ThreadKeeper and Conversation History retain separate PostgreSQL sessions and role boundaries.
- Checkpoint acceptance still requires valid external authority.
- Downstream handoff still reports `requires_independent_validation` and grants no inherited execution authority.
- C3 integration metrics are categorical and numeric only; they accept no raw evidence labels.

## Planned executable evidence

The isolated PostgreSQL C3 proof uses the real Conversation History and ThreadKeeper migrations and role contracts. It must prove:

- certified source availability;
- uncertified PASS evidence invisibility;
- initial baseline blocking before an accepted ThreadKeeper checkpoint exists;
- externally authorized first checkpoint acceptance;
- unchanged-source replay idempotency and INTACT assessment;
- changed certified source detection;
- linear externally authorized successor checkpoint lineage;
- stale downstream checkpoint rejection;
- current downstream handoff with complete lineage;
- independent downstream authority mode;
- Conversation History reader mutation denial;
- resolver outage degradation;
- restart durability;
- raw transcript/title canary exclusion from ThreadKeeper state and metrics.

## Evidence matrix

`config/threadkeeper-c3-evidence.v1.json` contains 29 governed items:

- 17 formal C3 gate requirements;
- 12 end-to-end integration scenarios.

Initial status intentionally remains pre-promotion. The matrix is fail-closed and cannot claim C3 while any required item remains partial or missing.

## Supabase Test boundary

Shared CoMind Test currently has no accepted real Conversation History baseline. TK-006 must not manufacture one merely to obtain a green C3 result. After isolated PostgreSQL proof passes, Test verification will instead confirm the deployed contracts and that the no-baseline condition fails closed cleanly. No synthetic shared Test baseline or private native export is required for C3 integration acceptance.

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

The sequence is fail-closed:

1. prove the real-contract vertical slice on an exact repository head;
2. close replay/degraded/privacy/authority scenarios;
3. verify bounded Supabase Test contracts without loading synthetic shared source evidence;
4. freeze the exact C3 implementation head;
5. reconcile Canonical Development Evidence and governed projections;
6. run post-change MCTRL;
7. only if all C3 items are proven, append the explicit C2 Implemented -> C3 Integrated promotion journal;
8. update the matrix to promotion-ready C3 and rerun exact-head gates;
9. merge only while the verified head remains current;
10. require post-merge main MCTRL and bounded live Test audit before acceptance closure.

No single test, commit, migration, or document is sufficient to establish C3 by itself.
