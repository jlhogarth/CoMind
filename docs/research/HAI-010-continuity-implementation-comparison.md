# HAI-010: Continuity Implementation Comparison and Synthetic Execution

Status: Implementation candidate, Test-only
Issue: https://github.com/jlhogarth/CoMind/issues/417
Predecessor: HAI-009 Issue #408 / PR #413
Production activation: false
Real participant collection: false
Paid provider execution: false
Schema mutation: none

## Purpose

HAI-010 executes the frozen HAI-009 continuity measurement contract against actual CoMind continuity mechanisms without changing the HAI-009 metric definitions after observing results.

HAI-010 is an engineering comparison. It does not claim human benefit, psychological construct validity, or Phase B efficacy.

## Frozen ruler

HAI-009 remains immutable.

- Protocol: `HAI-009-CONTINUITY-PILOT-v1`
- Manifest: `config/hai-009-continuity-pilot.v1.json`
- Manifest SHA-256: `b15611028f4b87b2ad4be60f46a4b3a0731b6e075b54d018238f16626d80cf5d`
- Scorer: `scripts/hai_009_continuity_pilot.mjs`
- Scorer SHA-256: `6e0d1c9747645d6063148da77ad35c093af2261986872319ce0440006cd9f438`

HAI-010 imports the HAI-009 scorer. It does not reproduce or modify its metric formulas.

## Evidence separation

Each HAI-010 trial has two evidence classes that must not be conflated.

### Metric observation

The metric source is the frozen HAI-009 synthetic observation contract. It provides the deterministic semantic case used by the unchanged HAI-009 scorer.

### Mechanism evidence

Mechanism evidence records what the actual CoMind continuity implementation executed. It cannot be promoted into a semantic outcome unless the implementation actually produced that semantic fact.

This distinction prevents a valid checkpoint, handoff, capsule, or reader operation from being misreported as proof that the system independently knew the correct task state.

## Conditions

### FRESH_SESSION

No retained state or continuity mechanism is supplied. This is the no-state baseline.

### MEMORY_ONLY

HAI-010 reuses the existing CHIST-001 isolated PostgreSQL proof. The real Conversation History reader runs under `comind_conversation_history_reader`, reads synthetic retained conversation content, and remains read-only. HAI-010 then exposes only a retention view consisting of message identity, role, content type, content text, and active-branch state.

Reconciliation, analytics, promotion candidates, hashes, attachments, checkpoints, capsules, authority, provenance, corrections, unresolved-state governance, and other governed annotations are excluded from the MEMORY_ONLY mechanism evidence. Leakage fails closed.

The CHIST-001 implementation probe is generic. HAI semantic metric observations remain the frozen HAI-009 fixture cases.

### GOVERNED_CONTINUITY

For each HAI-009 fixture, HAI-010 exercises actual CoMind pure runtime mechanisms:

1. `ThreadKeeperService.observe`
2. `ThreadKeeperService.assess`
3. `ThreadKeeperService.proposeCheckpoint`
4. `ThreadKeeperService.acceptCheckpoint`
5. continuity handoff integrity construction
6. `createContinuityCapsule`
7. `verifyContinuityCapsule`
8. `createContinuityPrecondition`
9. `validateContinuityPrecondition`
10. `validateContinuityCapsuleFidelity`

The checkpoint acceptance uses explicit synthetic external Test authority. It is not represented as human authority and grants no Production authority.

Fixture facts enter ThreadKeeper as labeled reference inputs. ThreadKeeper-produced receipts, classifications, digests, checkpoint acceptance, capsule integrity, precondition state, and fidelity results are recorded separately as system-produced mechanism evidence.

## Scenarios

The frozen HAI-009 scenario families remain:

- `ATLAS_RELEASE`
- `MERIDIAN_MIGRATION`
- `HARBOR_EVENT`

All three conditions execute for every scenario, producing nine deterministic trials.

## HAI-009 primary metrics

HAI-010 reports the frozen HAI-009 metrics separately:

- resume accuracy
- correction persistence rate
- stale-assumption persistence rate
- unresolved-commitment recovery rate
- provenance coverage
- context-reconstruction effort

No global HAI maturity score or hidden weighted composite is authorized.

## Fail-closed controls

HAI-010 rejects:

- HAI-009 manifest or scorer byte drift;
- condition ID drift;
- fixture ID drift;
- MEMORY_ONLY governance leakage;
- missing MEMORY_ONLY reader proof;
- missing required HAI-009 telemetry;
- provenance credit without provenance;
- Production, paid-provider, private-data, participant, schema-mutation, or Phase B activation;
- composite HAI scoring;
- synthetic Test authority represented as human authority.

## Determinism

HAI-010 uses fixed timestamps and deterministic identifiers. Identical inputs must produce byte-equivalent comparison receipts after stable serialization.

## Validation

The dedicated HAI-010 workflow performs:

1. exact-head checkout verification;
2. current server build;
3. isolated PostgreSQL CHIST-001 reader proof;
4. frozen HAI-009 adversarial tests;
5. HAI-010 adversarial tests;
6. nine-trial synthetic comparison execution;
7. immutable CI artifact upload.

The workflow artifact is named `hai-010-continuity-comparison-validation`.

## Boundaries

- No Production activation.
- No schema mutation.
- No paid provider execution.
- No private user data.
- No participant recruitment or collection.
- Phase B remains inactive.
- Synthetic results are engineering evidence only.
- A resolved handoff does not alone establish semantic continuity.
- A certified history hash does not alone establish task-level recovery.

## Rejected alternatives

A new continuity runtime was rejected because CoMind already has ThreadKeeper, Conversation History, handoff, and capsule mechanisms.

A copied HAI-009 scorer was rejected because it would create measurement drift risk.

Using private Conversation History data was rejected because isolated synthetic data can exercise the real reader without privacy exposure.

Treating mechanism integrity as semantic success was rejected because it would violate CoMind epistemic discipline.

A composite maturity score was rejected because HAI-009 explicitly keeps outcomes separate.

## Acceptance gates

HAI-010 is accepted only after the dedicated exact-head workflow and broad repository gates pass, current-main freshness is rechecked, and durable evidence is written.

## Successor direction

If HAI-010 passes, the HAI continuity measurement stack will have a frozen measurement contract plus actual implementation-mechanism evidence. A later separately governed lane may then determine whether the human feasibility Phase B protocol is ready for institutional, consent, privacy, and study-operations review.
