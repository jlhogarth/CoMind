# CE-002 Recovery and Reorientation Protocol Automation Provenance

Date: 2026-10-30
Issue: #338
Branch: `ce-002-recovery-reorientation-automation`
Base: `main` at `86c0ec6237e7867b77bd1d89433aea918939762e`
Environment: repository plus existing Supabase Test CE/RunBook state
Production activation: none
Paid provider execution: none

## Authority

Joseph Hogarth directed CE-002 implementation under the canonical CoMind Development Environment Contract.

Existing authority controls remain binding. CE-002 does not authorize Production activation, destructive Production mutation, paid provider execution, autonomous merge/deployment, or expansion beyond existing C0-C4 boundaries.

## Freshness

The branch was created from the then-current `main` after CUX-002 PR #335 merged. This intentionally supersedes the earlier CE-001 merge commit as the development baseline.

## Collision review

Open PRs and active lanes were inspected before implementation.

Material current lanes:

- HUD-MAIL-001 #340: Operator Console Workspace Mail presentation;
- TK-CONSOLE-001 #343: stacked Operator Console ThreadKeeper presentation;
- MDO-002 #334: provider-neutral MDO planning runtime and tests;
- CP-04 #311: isolated competitive evaluation lane;
- older lane-health proof branches: controlled workflow fixtures that must not merge;
- older BRAND, SDN, PI, Notebook, and OC drafts: no ownership of the new CE-002 server path.

CE-002 therefore uses isolated files under `server/src/continuous-excellence`, a focused server test, a dedicated CI workflow, and new CE-002 documentation. It does not edit active Console or MDO implementation files.

## Reuse-before-reinvention result

A genuine new recovery platform is unnecessary.

Existing reusable capability:

1. CE-001 provides immutable recovery signals, versioned Continuity Capsules, current-capsule projection, improvement lifecycle, and controlled write functions.
2. Durable RunBook provides append-only operational chronology and current work-state projection.
3. ACP continuity recovery restores integrity-checked conversation checkpoints and reconciles uncertain Foundry work against canonical adapter results and fenced leases.
4. ThreadKeeper provides accepted continuity checkpoint lineage, unresolved continuity cases, stale-head detection, and a provider/actor-neutral handoff that never transfers execution authority.
5. Canonical `comind.cm_task` provides task lifecycle identity.

CE-002 therefore implements only the missing coordination layer that reconciles these sources into one bounded recovery classification.

## Implementation

Added:

- `server/src/continuous-excellence/recovery.ts`
- `server/test/ce-002-recovery-reorientation.test.mjs`
- `docs/architecture/ce-002-recovery-reorientation.md`
- `.github/workflows/ce-002-recovery-reorientation.yml`
- this provenance record

The adapter separates read-only resolution from durable persistence.

### Read-only resolution

Resolution reads CE Capsule, canonical task, and RunBook state, and optionally composes ThreadKeeper, ACP, and approved connected-system observations.

It returns exactly one state:

- `complete`
- `ready`
- `partial`
- `blocked`
- `uncertain`

Unknown authority and material state contradictions fail closed as `uncertain`. Known approval/blocker boundaries become `blocked`. Missing dependencies become `partial`. Automatic continuation is identified only when state is `ready` and continuation authority is explicitly `authorized`.

### Durable persistence

Persistence uses existing CE-001 and RunBook paths:

- `comind.record_ce_signal(...)`
- `comind_pm.record_runbook_event(...)`
- `comind.capture_ce_continuity_capsule(...)`

Recovery interrupt identity provides replay protection. The adapter checks for an existing RunBook recovery event and recovery-sourced Capsule before appending. It creates a successor Capsule only when trustworthy recovery state materially changes.

No CE historical UPDATE, DELETE, or TRUNCATE path is introduced.

## ThreadKeeper boundary

CE-002 consumes `resolveContinuityHandoff(...)`. It does not create or accept ThreadKeeper checkpoints and does not inherit ThreadKeeper authority.

- stale expected checkpoint -> conflict / uncertain recovery;
- inconsistent lineage -> conflict / uncertain recovery;
- missing scope/checkpoint -> unavailable / partial recovery;
- blocked continuity case -> blocked recovery;
- unresolved non-blocked cases -> partial recovery;
- clean accepted handoff -> verified source.

## ACP boundary

CE-002 consumes `coordinateRecovery(...)`.

- `READY` -> verified ACP source;
- `ABSENT` -> partial recovery;
- `DEGRADED` -> partial recovery;
- `BLOCKED` -> state conflict / uncertain recovery.

The adapter never replays protected Foundry work during resolution.

## Connected-system boundary

GitHub, Supabase, CI, files, deployment, and other connector observations enter the deterministic core as bounded authoritative observations with explicit source reference and status. Network/provider access is deliberately outside the pure resolver.

This avoids a provider-coupled recovery core while retaining provenance and explicit conflict/unavailability semantics.

## Durable lane checkpoint

Before implementation, CE-002 was advanced to `in_progress` in the canonical task and Durable RunBook. Continuity Capsule v2 recorded:

- branch `ce-002-recovery-reorientation-automation`;
- base `86c0ec6237e7867b77bd1d89433aea918939762e`;
- composition decision;
- active implementation work;
- rollback to merged CE-001 if composition proved unsuitable.

Canonical branch evidence ID: `5e49e1ef-ac3b-4c5a-b3ba-112d5dce9ad7`.
RunBook event: `9efc3751-835c-43e8-888e-7dcb4e73a94a`.
Continuity Capsule v2 ID: `6cec5c29-bc03-4a74-aa63-f4b4380fda5e`.

## Deterministic verification contract

Focused tests cover:

1. complete CE/task/RunBook agreement;
2. ready continuation with verified connected-system observations;
3. unavailable dependency -> partial;
4. human authority boundary -> blocked;
5. authoritative source conflict -> uncertain;
6. canonical task/RunBook terminal disagreement;
7. ThreadKeeper stale-checkpoint conflict;
8. ThreadKeeper accepted handoff;
9. ACP degraded recovery;
10. repeated friction -> CE improvement recommendation;
11. material recovery -> successor Capsule;
12. idempotent replay -> no duplicate RunBook or Capsule history;
13. non-material recovery -> no Capsule churn;
14. read-only resolution emits no mutation SQL.

The dedicated workflow also runs the complete server regression suite after build and dependency audit.

## Current acceptance state

Repository implementation is present on the CE-002 branch. Exact-head GitHub CI is still required before engineering acceptance. Any CI failure must be preserved as CE evidence and repaired at its actual abstraction boundary.

No Production activation has occurred.
