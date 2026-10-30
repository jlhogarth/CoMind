# HAI-009 Development Evidence: Controlled Continuity Pilot Protocol

Date: 2026-10-30
Issue: https://github.com/jlhogarth/CoMind/issues/408
Lane: HAI-009
Environment: repository and synthetic Test-safe evidence only
Production activation: false

## Decision

Continuity is the first HAI domain selected for an executable controlled pilot protocol.

The decision is based on objective ground-truth availability, direct CoMind relevance, low instrument-rights friction, clean HAI-008 comparator conditions, safe synthetic execution, and leverage for later longitudinal domains.

This is a study-sequencing decision, not proof of a universal developmental stage order.

## Reuse findings

HAI-009 reuses the accepted CoMind evidence split rather than creating another research store:

- `comind.cm_evidence` remains canonical operational evidence identity;
- `comind_development.entity`, `relationship`, `artifact`, and `journal_entry` remain the durable development-evidence substrate;
- GitHub stores versioned machine-readable protocol, fixtures, scorer, tests, and CI evidence;
- Google Drive remains the human-readable HAI research/documentation center;
- raw synthetic run telemetry may remain a checksummed CI artifact referenced by canonical evidence.

No schema gap was demonstrated during protocol design, so no schema mutation is justified in HAI-009.

## Protocol freeze candidate

Protocol ID: `HAI-009-CONTINUITY-PILOT-v1`

Version: `1.0.0`

Conditions:

- `FRESH_SESSION`
- `MEMORY_ONLY`
- `GOVERNED_CONTINUITY`

Synthetic scenario families:

- `ATLAS_RELEASE`
- `MERIDIAN_MIGRATION`
- `HARBOR_EVENT`

Primary metrics remain separate:

- resume accuracy;
- correction persistence;
- stale-assumption persistence;
- unresolved-commitment recovery;
- provenance coverage;
- context-reconstruction effort.

No global HAI maturity score is emitted.

## Implementation evidence

Repository artifacts:

- `config/hai-009-continuity-pilot.v1.json`
- `scripts/hai_009_continuity_pilot.mjs`
- `server/test/hai-009-continuity-pilot.test.mjs`
- `.github/workflows/hai-009-continuity-pilot.yml`
- `docs/research/HAI-009-controlled-continuity-pilot-protocol.md`

Local pre-commit proof during authoring:

- canonical manifest validation: PASS;
- deterministic scoring run: PASS;
- adversarial Node tests: 15 PASS, 0 FAIL.

Repository CI remains the authoritative exact-head acceptance gate after publication to the branch.

## Collision and freshness

HAI-009 leased from `main` `c6b27f7f61f4817e60c909b7026523333e7480ea`.

HAI-008A PR #406 was open at lane creation and is limited to source-metadata corrections in the HAI-008 repository artifact. HAI-009 does not modify that file or branch. Final acceptance requires reconciliation after HAI-008A reaches a terminal state or current-main review proves no substantive HAI-009 collision.

## Boundaries

- No Production activation.
- No paid model/provider execution.
- No private or real participant data.
- No participant recruitment.
- No questionnaire item reproduction beyond verified rights.
- No automatic memory, RuleBook, decision, identity, Digital Twin, or architecture promotion.
- No claim that synthetic scoring fixtures are empirical results.
- No claim that the provisional 24-person Phase B sample is confirmatory.

## Recovery

HAI-009 repository changes are isolated to one branch and PR. Drive changes remain revisioned. If the lane fails acceptance, HAI-008 remains the accepted measurement baseline and HAI-009 failure evidence is retained.
