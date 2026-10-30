# IIC-004 Development Evidence

Issue: #348  
Branch: `iic-004-integrity-registry`  
Starting main: `879ebd0da76a0592fe3d63e603459d3d4e468606`

## Collision and reuse review

Open development lanes were inspected before branching. CE-002, MDO-002, Competitive CP-04, Conversation History K01, and older isolated branches do not own the new Integrity Registry, validator, test, or `docs/integrity/IIC-004.md` paths.

IIC-004 reuses the existing Integrity Governance workflow rather than creating a second governance workflow.

## Registry composition

The initial registry contains 24 cataloged controls.

Truthful maturity at creation:

- NPH-001: ENFORCED through the existing No Placeholder checker/workflow;
- NDT-001: ENFORCED through the IIC engine and IIC-003 contract;
- NFS-001: PROVEN, candidate-only and nonblocking;
- 21 successor controls: DEFINED only, with no detector or accepted-verification claim.

The four NFS candidate fingerprints reviewed in PR #346 are recorded as `accepted-pattern` with rationale, evidence source, and reconsideration triggers. They are not added to a scanner baseline or exclusion list.

## Local verification

Before repository write:

- canonical registry validation passed;
- 9 registry adversarial tests passed.

The suite covers duplicate IDs, definition-only detector overclaim, false enforcement state, backward maturity transitions, missing reconsideration triggers, unknown reviewed controls, missing detector paths, and silent NDT maturity downgrade.

## Storage decision

No database object is introduced. A versioned repository registry is sufficient for this control catalog and preserves direct code-review visibility. Existing CoMind evidence systems remain the authority for durable development evidence.

## Cost and recovery

No paid provider, database mutation, Production action, or runtime service. Cost is GitHub Actions runner time only. Recovery is repository revert.
