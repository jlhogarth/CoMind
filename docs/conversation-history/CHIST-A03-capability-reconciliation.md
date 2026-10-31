# CHIST-A03 Capability and Active-Lane Reconciliation

Issue: #304
Status: acceptance slice 1 complete
Production change: false

## Decision

CHIST-A03 extends the existing Conversation History evidence plane. It does not create a second archive, project registry, decision store, memory store, graph, or promotion path.

## Certified analytical source

The bounded Test corpus is the accepted native OpenAI export import `f118f46b-2d5c-4f39-8c9d-063e972bab73`, certified as baseline `059d2e64-d445-4165-a8a7-efe996830947` under `chist_baseline_cert_v1` on 2026-10-29. Aggregate readback observed 1,212 conversations, 32,305 nodes, and 31,093 messages. No private conversation text was read or recorded for this reconciliation.

The raw archive remains canonical source evidence. Every A03 result is derived evidence and must retain exact import, baseline, policy, run, actor, branch, and source lineage as applicable.

## Reuse map

| Requirement | Existing capability | A03 disposition |
| --- | --- | --- |
| Certified source gate | `comind.cm_conversation_history_baseline` and CHIST-001 certification | Reuse exactly; analysis must reject uncertified imports. |
| Raw conversation/node provenance | `cm_archive_conversation_observation`, `cm_archive_node_observation` | Reuse as immutable source observations. |
| Deterministic per-conversation metrics | CHIST-A01 `cm_archive_derivation_run` and `cm_archive_metric_fact` | Reuse facts and run identity; do not duplicate objective metrics. |
| Session policy and temporal rollups | CHIST-A02 session policy/run/event/rollup structures | Reuse policy materialization and reader/deriver separation. |
| Decision/assumption/question/action candidate markers | CFR-001G deterministic derivation | Consume existing candidate semantics where applicable; no automatic promotion. |
| Project identity | Canonical CoMind project registry | Reference existing identity only. |
| Epistemic relationships | Existing EDG/GER substrate | Link derived observations where authorized; do not create a parallel graph. |
| Retrieval | CHIST-K01 hybrid retrieval | Independent consumer capability; merged and not an A03 prerequisite. |

## Active-lane and collision result

At dispatch, `main` was `465238b210b84155597bd74a4b2dc0f111900662`. No existing `chist-a03-corpus-analytical-baseline` branch was present, and no open pull request owned Issue #304. The branch is therefore a collision-free one-issue, one-branch lane.

Open draft PRs in other lanes remain independently owned and are not modified by A03. CHIST-001 remains externally bounded for a separate baseline lifecycle concern, but the exact certified baseline required by Issue #304 exists and is sufficient for the authorized bounded analytical work.

## A03 additive schema boundary

The next implementation slice may add only versioned, append-only analytical run and observation structures that are not already represented by A01/A02. The minimum new concerns are:

1. Corpus analytical run identity bound to exact certified baseline/import and deterministic policy versions.
2. Active-path versus alternate-branch provenance observations.
3. Deterministic concept census and first/last occurrence observations with actor attribution.
4. Concept co-occurrence bridge observations with deterministic calculation identity.
5. Explicit analysis mode classification separating deterministic observations from model-assisted candidates.
6. Candidate Digital Twin signal-family observations that cannot promote themselves.

All mutable truth stores, automatic Memory/RuleBook/architecture/task/profile/Digital-Twin promotion, and Production activation are out of scope.

## Acceptance invariants for the implementation slice

- Exact certified baseline is mandatory.
- Run identity is immutable and reproducible from source lineage plus policy identity.
- Reader and deriver privileges remain separated.
- Derived tables are append-only and reject update/delete mutation.
- Recalculation creates or resolves an exact versioned run; it does not rewrite historical evidence.
- Branch provenance and actor attribution survive derivation.
- Synthetic acceptance uses no private conversation content.
- Supabase Test validation is aggregate-only.
- Ordinary Data API roles receive no private analytical table access.
- Security and performance advisor findings must be reconciled before merge.
- Production remains unchanged.

## CLEAR result

Capability: PASS. Existing CHIST-A01/A02, archive derivation, CFR marker derivation, project registry, and epistemic graph capabilities provide the required foundations.

Lane: PASS. Issue #304 is the single authority unit for this branch.

Evidence: PASS. Certified Test baseline and aggregate corpus counts were observed without raw-content exposure.

Architecture: PASS. The additive boundary avoids parallel canonical systems and preserves source/derived separation.

Risk: BOUNDED. The implementation must preserve append-only semantics, least privilege, exact baseline gating, and no-promotion constraints. These are acceptance gates, not reasons to idle.

The dependency-valid next action is implementation of the append-only A03 analytical run/observation schema and deterministic synthetic acceptance on this same branch.