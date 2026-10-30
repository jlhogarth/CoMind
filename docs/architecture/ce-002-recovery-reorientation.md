# CE-002 Recovery and Reorientation Protocol Automation

Status: implementation candidate
Issue: #338
Predecessor: merged CE-001 #332 / PR #333
Environment: Test-first
Production activation: excluded

## Objective

CE-002 turns the CE-001 recovery protocol into a deterministic server-side adapter. It restores trustworthy orientation after lost context, reasoning interruption, stale conversational state, uncertain tool outcomes, or an explicit recovery request without creating a second recovery platform.

The adapter is deliberately thin. It composes existing CoMind truth and continuity systems and produces one bounded recovery decision:

- `complete`
- `ready`
- `partial`
- `blocked`
- `uncertain`

It never converts missing information into invented state.

## Composition decision

CE-002 reuses:

- CE-001 `v_ce_current_continuity_capsule` for durable objective, baseline, constraints, approvals, blockers, and recovery state;
- `comind.cm_task` for canonical task lifecycle;
- Durable RunBook for operational chronology and current lane state;
- ThreadKeeper `resolveContinuityHandoff(...)` for accepted checkpoint lineage, current continuity digest, and unresolved continuity cases;
- ACP `coordinateRecovery(...)` for conversation-checkpoint restoration and Foundry lease/adapter-result reconciliation;
- CE-001 `record_ce_signal(...)` and `capture_ce_continuity_capsule(...)` for durable recovery evidence and successor state;
- Durable RunBook `record_runbook_event(...)` for consequential recovery chronology.

No new task, evidence, audit, checkpoint, orchestration, agent, or execution substrate is introduced.

## Collision and freshness analysis

Implementation began from `main` commit `86c0ec6237e7867b77bd1d89433aea918939762e`, after CUX-002 PR #335 merged.

Active lanes inspected before implementation:

- HUD-MAIL-001 PR #340 changes Operator Console presentation only;
- TK-CONSOLE-001 PR #343 is stacked on #340 and changes Operator Console ThreadKeeper visibility only;
- MDO-002 PR #334 changes the MDO planning runtime and tests, not the CE-002 adapter path;
- legacy lane-health proof PRs are isolated workflow fixtures;
- older BRAND, SDN, PI, Notebook, and OC drafts do not own the new CE-002 server path.

CE-002 therefore uses isolated paths under `server/src/continuous-excellence`, a focused server test, a dedicated workflow, and CE-002 documentation. It does not modify active Console surfaces or MDO runtime files.

## Recovery request contract

A recovery request identifies:

- canonical project and task IDs;
- CE capsule key;
- RunBook project and work keys;
- interrupt identity, trigger, provenance, and observation time;
- current continuation authority as `authorized`, `requires_approval`, or `unknown`;
- optional ACP conversation identity and authority;
- optional ThreadKeeper scope and expected checkpoint;
- optional authoritative observations already obtained from approved connected systems;
- optional next safe action and prior similar-recovery count.

The interrupt key is an idempotency identity. Replaying the same recovery interrupt must not manufacture a second RunBook event or Continuity Capsule version.

## Resolution order

The adapter performs read-only reconciliation first.

1. Load the current CE Continuity Capsule.
2. Load canonical task state.
3. Load Durable RunBook state.
4. If requested, resolve ThreadKeeper's accepted continuity handoff.
5. If requested, run ACP checkpoint and Foundry outcome reconciliation.
6. Incorporate approved authoritative observations from connected systems.
7. Detect canonical state contradictions, blockers, pending approvals, unavailable dependencies, and authority uncertainty.
8. Classify recovery and decide whether automatic continuation is already authorized.

Resolution itself emits no writes.

## Classification rules

### `complete`

The CE Capsule, canonical task, and RunBook all agree that the objective is complete and no conflicting or blocking source exists.

### `ready`

The trustworthy continuation point is established, no material source is unavailable or contradictory, and the work is not terminal. `resumeAllowed` is true only when existing continuation authority is explicitly `authorized`.

### `partial`

Useful state is recovered, but at least one material dependency or authoritative source is unavailable or degraded. Automatic continuation is disabled.

### `blocked`

A known blocker, pending approval, blocked ThreadKeeper case, blocked canonical work item, or explicit human-authority boundary prevents continuation. A verified block is not treated as uncertainty.

### `uncertain`

Material authoritative sources conflict, canonical task and RunBook terminal state disagree, ThreadKeeper reports stale or inconsistent lineage, ACP integrity/identity recovery blocks, or continuation authority itself is unknown.

`uncertain` outranks `blocked` because a known block cannot establish a trustworthy continuation point when the underlying state is contradictory.

## ThreadKeeper boundary

CE-002 consumes ThreadKeeper through the accepted provider-neutral continuity handoff. ThreadKeeper remains owner of accepted checkpoint lineage and unresolved continuity cases.

A stale expected checkpoint or inconsistent lineage is a conflict. Missing scope or checkpoint is an unavailable dependency. CE-002 does not create or accept ThreadKeeper checkpoints and cannot inherit ThreadKeeper authority.

## ACP boundary

CE-002 consumes ACP through `coordinateRecovery(...)`.

ACP may restore an integrity-checked conversation checkpoint and reconcile uncertain operations against canonical Foundry adapter results and fenced work leases. A canonical terminal adapter result may prove work completed without replay. An unresolved or superseded lease keeps recovery degraded.

CE-002 does not replay Foundry work during resolution.

## Connected-system observations

The adapter can receive bounded authoritative observations obtained by an approved caller from GitHub, Supabase, CI, files, deployments, or another approved connector.

Each observation is explicit:

- source system;
- source reference;
- subject;
- status: `verified`, `unavailable`, `blocked`, or `conflict`;
- summary.

This keeps network/provider access outside the deterministic recovery core while preserving source provenance and conflict semantics. A caller cannot silently present an unverified observation as authoritative because status is part of the contract and is included in the recovery decision and evidence.

## Persistence and replay safety

`persistRecoveryOutcome(...)` is separate from resolution.

It:

1. records an idempotent CE recovery-interrupt signal;
2. records one consequential RunBook recovery event for the interrupt identity;
3. creates a successor Continuity Capsule only when the trustworthy continuation state materially changed;
4. detects prior capsule persistence for the same interrupt and returns it rather than creating duplicate history.

The adapter emits no `UPDATE`, `DELETE`, or `TRUNCATE` against CE history. Historical Capsule immutability remains enforced by CE-001 database controls.

A partial persistence failure is retryable because signal capture is idempotent, RunBook replay is detected by source reference, and Capsule replay is detected by its recovery source reference.

## Friction feedback

A recovery event does not automatically create an improvement merely because it occurred.

For `partial`, `blocked`, or `uncertain` recovery, two or more prior similar recoveries cause the resolver to set `improvementRecommended=true`. The persisted CE signal identity can then be used by the existing CE improvement lifecycle. This avoids automatic rule accumulation while making repeated friction machine-visible.

## Authority

CE-002 does not expand authority.

- `authorized`: recovery may identify automatic continuation as safe, but only inside the authority already granted to the caller.
- `requires_approval`: recovery is `blocked` until approval exists.
- `unknown`: recovery is `uncertain`; permission is never inferred.

No Production activation, paid provider execution, autonomous merge, deployment, or destructive Production mutation is authorized by CE-002.

## Verification

Deterministic tests cover:

- complete canonical agreement;
- ready recovery with verified connected-system observations;
- unavailable dependency -> partial;
- human authority boundary -> blocked;
- authoritative conflict -> uncertain;
- canonical task/RunBook terminal conflict;
- ThreadKeeper stale checkpoint conflict;
- ThreadKeeper accepted handoff;
- ACP degraded recovery;
- repeated friction recommendation;
- successor Capsule creation on material change;
- idempotent replay without duplicate RunBook or Capsule history;
- non-material recovery without unnecessary Capsule churn;
- read-only resolution mutation guard.

Exact-head CI remains the acceptance gate. Production activation is separately governed.
