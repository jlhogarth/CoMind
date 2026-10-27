# TK-005 ThreadKeeper C2 Evidence Completion - Initial Provenance

## Identity

- Issue: #248 - TK-005: Complete ThreadKeeper C2 evidence package and promotion gate
- Branch: `tk-005-c2-evidence-gate`
- Base at lane creation: `b43ad4cabc3d776fe0fb7e54560ddf7e7c5e0e35`
- Governing capability contract: TK-001
- Governing implementation design: TK-002
- Accepted implementation slices: TK-003 deterministic core and TK-004 persistence substrate
- Production activation required: **false**
- Public HTTP endpoint required: **false**
- SDN registration required: **false** for C2
- Current maturity: **C1 Contracted**
- Target maturity: **C2 Implemented**
- Automatic promotion: **forbidden**

## Decision

TK-004 proved the durable ThreadKeeper persistence slice but did not prove the entire C2 capability. TK-005 therefore treats maturity promotion as an evidence-closure problem rather than as another architecture-design exercise.

The lane adapts the accepted PFC-001 evidence-contract pattern:

- versioned machine-readable evidence matrix,
- fail-closed validator,
- negative contract tests,
- dedicated exact-head CI gate,
- explicit distinction between proven, partial, missing, and not-applicable claims,
- final maturity transition only after every required item is satisfied.

No single code merge, migration, test suite, document, historical implementation, or green workflow may promote ThreadKeeper to C2 by itself.

## First executable slice

The first TK-005 slice adds:

- `config/threadkeeper-c2-evidence.v1.json` - 16 formal C2 gate requirements plus the full TK-002 test matrix;
- `scripts/threadkeeper_c2_matrix.mjs` - fail-closed evidence and promotion validator;
- `server/test/threadkeeper-c2-evidence.test.mjs` - negative maturity-contract tests;
- `.github/workflows/tk-005-threadkeeper-c2.yml` - dedicated evidence gate.

The validator requires all formal requirement IDs and all TK-002 unit, PostgreSQL, boundary, and failure-injection IDs to remain present. Proven claims require live repository files. Not-applicable claims require a repository-backed rationale. Promotion readiness cannot become true while any required item remains partial or missing, and an explicit promotion journal key is forbidden until readiness is true.

## Initial evidence census

The initial matrix contains **66** governed items:

- 16 formal C2 promotion requirements;
- 20 unit requirements;
- 12 isolated PostgreSQL requirements;
- 6 boundary-adapter requirements;
- 12 failure-injection requirements.

Initial status:

- **31 proven**
- **15 partial**
- **19 missing**
- **1 not applicable**

This is an evidence inventory, not a maturity score. ThreadKeeper remains C1 Contracted.

## Evidence already strong

Existing executable evidence already covers substantial C2 ground:

- deterministic semantic scope identity;
- ambiguity rejection;
- intact, suspected-break, confirmed-break, unresolved-conflict, blocked, and authorized-divergence classifications;
- missing-evidence fail-closed behavior;
- secret/credential rejection;
- checkpoint proposal integrity and tamper detection;
- ThreadKeeper self-approval prohibition;
- external authority acceptance;
- stale accepted-head rejection;
- ACP regression preservation;
- migration replay;
- private RLS/privilege posture;
- append-oriented immutability;
- scope registration idempotency;
- accepted-checkpoint linear lineage;
- concurrent single-winner acceptance;
- assessment idempotency conflict rejection;
- case lifecycle and terminal-state enforcement;
- compact continuity context readback.

TK-004 additionally has accepted post-merge main evidence:

- ThreadKeeper PostgreSQL proof run `40427693053` - PASS;
- MCTRL run `40427693035` - PASS;
- bounded live Test audit: 18 PASS, 0 WARNING, 0 FAIL;
- MCTRL artifact `12701155845`;
- artifact digest `sha256:1ecec7eb4eaf38befde077ea282100ea3ca5c353ff88855e720958dbb03367ea`;
- canonical acceptance journal `JRN-20261026-0014`.

## Concentrated remaining gaps

The largest remaining gaps are not architecture gaps. They are evidence and bounded-runtime gaps:

1. vendor-neutral ThreadKeeper observability;
2. explicit Conversation History, Foundry, Helper Matrix, SEAL, and Agent Communication boundary-adapter/no-execution proofs;
3. evidence resolver timeout/dependency outage behavior;
4. missing provenance and stale external authority fixtures;
5. route-cycle detection and bounded escalation;
6. storage-write failure handling;
7. false-positive break dismissal while preserving the original assessment;
8. explicit raw-payload/log/metric canary exclusion;
9. several direct negative PostgreSQL assertions already implied by schema but not yet proven at the integration-test surface;
10. final exact implementation binding, projection reconciliation, final MCTRL, and explicit C2 promotion journal.

## Scope discipline

TK-005 does not authorize ThreadKeeper to absorb neighboring systems. In particular:

- Conversation History remains source of truth for raw conversation events;
- Memory Graph remains source of truth for durable memory entities and graph relationships;
- Foundry remains source of truth for execution, leases, fencing, retries, and outcomes;
- Agent Communication remains source of truth for transport/routing/addressing;
- Helper Matrix routes may be recommended but helpers are not executed by ThreadKeeper;
- SEAL routes may be recommended but revisions are not executed by ThreadKeeper;
- EIK retains epistemic/truth authority;
- Digital Twin identity and memory remain outside ThreadKeeper;
- ACP-001 remains a distinct continuity/recovery substrate.

## Promotion rule

The promotion sequence is fail-closed:

1. close the remaining evidence gaps;
2. freeze the exact implementation/evidence head;
3. reconcile canonical Development Evidence;
4. reconcile governed CCI/MLC/DPE/EDG maturity projections where required;
5. run exact-head MCTRL;
6. only if every C2 matrix item is proven or validly not applicable, append the explicit C2 promotion event;
7. update the matrix to `ready=true` with that promotion journal key;
8. require the dedicated TK-005 gate and repository CI to pass on the promoted head.

If any later verification fails, the promotion is not accepted.
