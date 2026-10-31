# CE-003 Missingness and Forward Reasoning Scan

Status: implementation candidate
Issue: #364
Environment: Test-first
Authority: existing CoMind Development Environment Contract

## Objective

CE-003 turns the approved Continuous Excellence Missingness Scan into a deterministic runtime contract. It evaluates explicit evidence-bearing inputs before consequential action and surfaces only omissions or forward consequences that can materially affect success, safety, cost, reversibility, authority, durability, or operator burden.

The scan does not perform free-form speculative reasoning. It does not infer missing facts, grant authority, or create a new decision platform.

## Composition

CE-003 reuses accepted CoMind substrates:

- CE-001 `comind.cm_ce_signal` and `comind.record_ce_signal(...)` for durable missingness and opportunity signals;
- CE-002 recovery semantics when authoritative work state must be reconstructed after interruption;
- Durable RunBook for consequential operational chronology;
- `comind.cm_project` and `comind.cm_task` for work identity;
- `comind.cm_evidence` for canonical evidence identity;
- ThreadKeeper and ACP for their existing continuity responsibilities;
- MDO and specialist agents for their existing planning and execution responsibilities;
- C0-C4 and T0-T2 authority ceilings remain controlling.

No CE-003 table, shadow task ledger, decision ledger, or parallel evidence store is introduced.

## Deterministic request

`scanMissingness(...)` receives an explicit request containing:

- canonical project and task identities;
- objective and proposed action;
- consequence level: `low`, `moderate`, `high`, or `critical`;
- whether the work is substantial;
- explicit authority state;
- source provenance and observation time;
- consequence flags such as Production, data mutation, security boundary, user-facing impact, paid provider, irreversibility, external dependency, and long-lived architecture;
- dimension assessments;
- optional structured dependency, assumption, adjacent-system, commitment, reuse, and opportunity records.

The evaluator is pure and performs no database or external-system write.

## Scan dimensions

The implementation preserves the approved CE dimension family:

1. dependencies and prerequisites;
2. assumptions and confidence;
3. adjacent systems;
4. failure modes;
5. rollback and recovery;
6. security and data integrity;
7. observability and evidence;
8. usability and accessibility;
9. testing and acceptance;
10. maintenance, ownership, and documentation;
11. cost and provider dependency;
12. authority and approvals;
13. reversibility;
14. reusable existing capability;
15. costly-to-reverse commitments;
16. low-cost opportunities worth preserving now.

## Proportionality policy

The scanner does not require all sixteen dimensions for every action.

Base low-consequence requirements are limited to:

- required dependencies;
- authority;
- reuse review.

Substantial or moderate-consequence work additionally requires:

- assumptions;
- rollback/recovery;
- observability/evidence;
- testing/acceptance;
- reversibility.

High-consequence work additionally requires:

- adjacent systems;
- failure modes;
- security/data integrity;
- maintenance/ownership/documentation;
- cost/provider dependency.

Consequence flags add dimensions only when relevant. For example, user-facing work adds usability/accessibility, paid-provider work adds cost/provider dependency, and irreversible or long-lived architecture adds costly-to-reverse commitment review.

A required dimension must be supported by provenance or an evidence-backed not-applicable disposition. Required unknown, gap, unassessed, or provenance-free state fails closed.

## Specialized forward-reasoning rules

The deterministic engine detects explicit conditions including:

- required dependency unavailable or unknown;
- material assumption with weak confidence or no supporting evidence;
- affected adjacent system with unresolved impact or owner;
- unknown authority or explicit approval boundary;
- costly or hard-to-reverse commitment with no preserved alternative or reconsideration trigger;
- substantial work where reuse has not been checked;
- low-cost material opportunity that preserves future optionality.

These rules operate only on supplied structured facts. The engine does not invent a dependency, adjacent system, failure mode, cost, or authority relationship because it appears plausible.

## Findings

Every surfaced finding contains:

- stable code;
- optional subject key;
- dimension;
- finding type;
- severity;
- whether it blocks;
- whether action is required;
- concise summary and rationale;
- next action;
- normalized evidence references;
- SHA-256 fingerprint.

Findings are ordered deterministically by blocking state, severity, dimension, code, and subject key.

The scan itself receives a deterministic SHA-256 fingerprint over canonicalized input. Arrays are canonicalized independently of caller ordering so semantically equivalent input ordering produces the same scan identity.

## Decision semantics

The result is one of:

- `proceed`: no material finding;
- `proceed_with_attention`: material nonblocking findings exist;
- `blocked`: at least one finding prevents safe continuation.

The scan may block or recommend. It does not execute the proposed action and it does not create authority.

## Persistence boundary

`persistMissingnessFindings(...)` is deliberately separate from evaluation.

For each material finding it:

1. derives a stable idempotency key from the scan and finding fingerprints;
2. checks for an existing CE signal for that project/idempotency identity;
3. reuses the existing signal on replay;
4. otherwise calls the accepted CE-001 `comind.record_ce_signal(...)` function;
5. maps opportunities to CE `opportunity` and all other CE-003 findings to CE `missingness`;
6. stores the complete structured finding in CE signal details with source provenance.

No direct UPDATE, DELETE, or history mutation is introduced.

The persistence adapter recomputes the scan before writing and rejects a tampered or mismatched result.

## RunBook boundary

CE-003 does not write a RunBook event for every scan. That would create operational noise.

A caller should record a consequential RunBook event when the scan changes the trustworthy execution decision, such as blocking an action, redirecting work to satisfy a prerequisite, or establishing a new accepted continuation point. RunBook remains the owner of operational chronology.

## Relationship to CE-002

CE-002 answers: "What trustworthy state can we recover and where can work safely resume?"

CE-003 answers: "Before the next consequential action, what material evidence-backed omission or forward consequence remains?"

CE-003 may consume recovered state, but it does not duplicate recovery, checkpoint reconciliation, or ThreadKeeper lineage logic.

## Security and authority

- Test-first only for this increment.
- No Production activation.
- No paid provider execution.
- No destructive Production action.
- No authority expansion.
- Unknown authority blocks rather than being inferred.
- Evidence-bearing structured input is required for accepted required dimensions.
- Persistence uses existing CE-001 bounded write paths.

## Acceptance strategy

Focused deterministic tests cover proportionality, complete high-consequence state, authority boundaries, rollback, weak assumptions, unavailable dependencies, adjacent impacts, acceptance evidence, costly commitments, reuse, low-cost opportunities, fingerprint stability, malformed contradictions, replay safety, and tamper rejection.

A PostgreSQL 17 integration test applies the accepted CE-001 substrate and proves the CE-003 persistence adapter against the real `record_ce_signal(...)` signature and unique idempotency behavior inside a rolled-back transaction.

Exact-head server build, focused CE-003 tests, PostgreSQL integration, full server regression, dependency audit, No Placeholder, Implementation Integrity, and final freshness/collision evidence are required before review readiness.

## Recovery

CE-003 repository work can be reverted independently. The integration proof is rollback-only. No new schema needs rollback. Existing CE signals created by a real future scan are immutable evidence and would be superseded or dispositioned through the CE lifecycle rather than deleted.
