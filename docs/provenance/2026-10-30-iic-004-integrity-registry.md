# IIC-004 Development Evidence

Issue: #348  
Branch: `iic-004-integrity-registry`  
Starting main: `879ebd0da76a0592fe3d63e603459d3d4e468606`

## Collision and reuse review

Open development lanes were inspected before branching. CE-002, MDO-002, Competitive CP-04, Conversation History K01, and older isolated branches do not own the new Integrity Registry, validator, test, or `docs/integrity/IIC-004.md` paths.

IIC-004 reuses the existing Integrity Governance workflow rather than creating a second governance workflow.

## Registry composition

The registry contains 24 cataloged controls.

Truthful maturity at creation:

- NPH-001: ENFORCED through the existing No Placeholder checker/workflow;
- NDT-001: ENFORCED through the IIC engine and IIC-003 contract;
- NFS-001: PROVEN, candidate-only and nonblocking;
- 21 successor controls: DEFINED only, with no detector or accepted-verification claim.

The compact registry schema separates `implemented_controls` from `defined_controls`, so a definition-only control cannot accidentally inherit detector or enforcement fields.

The four NFS candidate fingerprints reviewed in PR #346 are recorded as `accepted-pattern` with rationale, evidence source, and reconsideration triggers. They are not added to a scanner baseline or exclusion list.

## Initial verification

Before repository write:

- canonical registry validation passed;
- 9 initial registry adversarial tests passed.

## No Placeholder collision and repair

The first exact-head PR run failed the existing No Placeholder Policy because the NPH definition itself used an explanatory form of the reserved unfinished-work marker followed by `-bound`. The policy scanner correctly treats that reserved marker as unresolved development work and does not infer semantic context.

The gate was not weakened and no exclusion was added. The definition was reworded to `unfinished-marker-bound behavior`.

A second exact-head run failed because the first provenance explanation reproduced the reserved marker literally while documenting the failure. The evidence was retained again without reproducing the forbidden token. This demonstrates that governance documentation is intentionally subject to the same hard gate as implementation artifacts.

During the repair, the registry was also simplified so the three implemented controls and 21 definition-only controls occupy separate structural collections. The validator was adapted to the compact schema and now additionally requires exactly 24 unique cataloged controls. The adversarial suite increased to 10 tests.

Both failed exact-head runs remain development evidence. Only a fresh exact-head run after this repair can satisfy acceptance.

## Storage decision

No database object is introduced. A versioned repository registry is sufficient for this control catalog and preserves direct code-review visibility. Existing CoMind evidence systems remain the authority for durable development evidence.

## Cost and recovery

No paid provider, database mutation, Production action, or runtime service. Cost is GitHub Actions runner time only. Recovery is repository revert.
