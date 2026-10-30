# Continuous Excellence Architecture

Status: CE-001 foundation
Primary issue: #332
Environment: Test-first

## Architectural objective

Continuous Excellence adds a thin improvement-control layer over existing CoMind systems. It must not create parallel project, task, evidence, audit, orchestration, or agent-execution systems.

The architecture preserves five distinct responsibilities:

1. Operational chronology lives in the Durable RunBook.
2. Canonical work identity lives in `comind.cm_project` and `comind.cm_task`.
3. Evidence identity and provenance live in `comind.cm_evidence` and existing audit facilities.
4. Governed agent execution lives in Foundry and module planning lives in MDO.
5. Continuous Excellence owns cross-cutting signals, continuity capsules, improvement lifecycle, recovery semantics, and the learning loop.

## Data model

### `comind.cm_ce_signal`

Immutable observation of a material condition. Supported types are friction, failure, recovery interrupt, missingness, regression, opportunity, completion gap, and continuity risk.

Signals carry severity, actionability, source provenance, optional actor/task relationships, and an optional idempotency key. Repeated capture with the same project and idempotency key returns the existing signal rather than mutating history.

### `comind.cm_ce_continuity_capsule`

Immutable versioned recovery package. A capsule records the minimum durable state required to reorient work after interruption. Each successor names exactly one predecessor, must increment the prior version by one, and receives a deterministic SHA-256 hash over its substantive content.

Current capsule state is computed by `comind.v_ce_current_continuity_capsule`, which selects lineage leaves. No current-state flag is mutated.

Recovery state is explicit: `ready`, `partial`, `blocked`, `uncertain`, or `complete`.

Confidence is explicit: `verified`, `mixed`, or `uncertain`.

### `comind.cm_ce_improvement`

Immutable stable identity for a proposed systemic improvement. The row records project ownership, optional task and actor ownership, category, title, rationale, and creation time.

### `comind.cm_ce_improvement_event`

Append-only lifecycle for an improvement. Events support proposed, approved, implemented, validated, measured, blocked, rejected, reverted, superseded, and retained states. `comind.v_ce_improvement_state` projects the latest event without rewriting history.

### Evidence links

Signal, improvement, and capsule evidence relationships link to `comind.cm_evidence`. Continuous Excellence does not create a second evidence store.

## Write paths

The base CE tables are private and protected by row level security. Browser roles have no direct access.

Controlled private functions provide bounded writes:

- `comind.record_ce_signal`
- `comind.capture_ce_continuity_capsule`
- `comind.open_ce_improvement`
- `comind.record_ce_improvement_event`

These functions are `SECURITY DEFINER`, live in the private `comind` schema, use fixed search paths, and are executable only by the service role in the foundation. Direct CE table writes are not granted to browser roles or the service role.

The capsule capture function uses an advisory transaction lock scoped to project, task, and capsule key so two writers cannot validly create the same successor version.

## Immutability

All CE historical tables reject UPDATE and DELETE through an explicit mutation trigger. A state transition produces a new row or a new event.

This provides three properties:

- auditability of the exact historical sequence;
- recovery from a known predecessor rather than a mutable snapshot;
- regression analysis that can compare before and after states without reconstructing overwritten records.

## Read projections

Private projections:

- `comind.v_ce_current_continuity_capsule`
- `comind.v_ce_signal_backlog`
- `comind.v_ce_improvement_state`

Trusted Operator Console projections in `public`:

- `public.v_ce_operator_summary`
- `public.v_ce_operator_state_counts`

The public-schema views do not imply public access. They revoke access from `PUBLIC`, `anon`, and `authenticated`, and grant read access only to the service role. They expose aggregate operational state and no CE narrative content.

## Recovery protocol

A recovery interrupt is interpreted as a control signal, not merely conversational text, when the surrounding context indicates interrupted work.

The protocol is:

1. Freeze unsupported inference about missing state.
2. Resolve the active objective and canonical project or lane.
3. Retrieve the current Continuity Capsule and RunBook state.
4. Reconcile against authoritative external systems such as GitHub, Supabase, CI, files, deployments, or connected services where applicable.
5. Classify each recovered fact as verified, mixed, or uncertain.
6. Identify completed, incomplete, blocked, and ambiguous work.
7. Choose the smallest safe continuation action.
8. Resume automatically when existing authority permits.
9. Capture the recovery signal and a successor capsule when durable state materially changed.
10. Determine whether the event should create a systemic improvement.

Recovery never converts missing information into invented state.

## Missingness Scan

The Missingness Scan is proportionate to consequence. It examines only dimensions that can materially affect the objective:

- dependencies and prerequisites;
- assumptions and confidence;
- affected adjacent systems;
- rollback and compensation;
- security and data integrity;
- observability and evidence;
- usability and accessibility;
- testing and acceptance;
- cost and provider dependency;
- authority and approvals;
- documentation and ownership;
- reversibility;
- reusable existing capability;
- costly-to-reverse decisions;
- low-cost opportunities worth preserving now.

Only material findings are surfaced to the user.

## Evidence-based completion

A substantial task is complete only when its completion criteria and verification method are satisfied by inspectable evidence. Activity, a successful tool response, a clean narrative, or agent confidence is insufficient by itself.

For long-running work, Continuity Capsules provide a durable distinction between current progress and final acceptance.

## Friction-to-improvement flow

The intended lifecycle is:

`signal -> diagnosis -> improvement proposal -> implementation -> validation -> measurement -> retain or revert`

A signal may remain informational and require no improvement. A material improvement can link multiple signals. Validation and failure evidence remains in the canonical evidence store.

## Foundry integration boundary

Continuous Excellence does not require a new agent runtime. A future `continuous_excellence_reviewer` must use the existing Foundry profile, capability, grant, authorization, attempt, execution, and outcome machinery.

Initial authority ceiling is C1. Read-only review belongs at C0. Bounded recording of CE signals belongs at C1. Paid providers, Production actions, deployment, merge, destructive mutations, and authority expansion are outside the CE reviewer foundation.

A Foundry adapter must not be added merely to satisfy an architectural diagram. It is added only when it can perform a real bounded review against authoritative inputs and produce verifiable output without placeholder behavior.

## Operator Console boundary

CE-001 adds a read-only operator surface. Protected CE data must use a server-only secret and an explicit trusted-perimeter mode. No privileged credential may be prefixed with `NEXT_PUBLIC_` or enter browser code.

The CE page must not take ownership of CUX-002 readability and accessibility remediation. It should reuse existing Console primitives and remain narrow enough to avoid conflict with that active lane.

## RunBook integration

CE-001 itself must have a RunBook work item and consequential checkpoints. RunBook remains authoritative for operational chronology. CE signals may refer to RunBook events by source reference, but CE does not copy the RunBook event ledger.

A recovery event that changes the trustworthy continuation point should normally result in both:

- a RunBook event describing the operational recovery action;
- a CE signal or successor capsule describing the continuity lesson and recoverable state.

## Security model

Defense in depth:

- private CE tables in the `comind` schema;
- RLS enabled on all CE tables;
- no policies for browser roles in the foundation;
- no direct browser access;
- no direct service-role writes to base CE tables;
- bounded private write functions;
- immutable historical records;
- version-lineage validation;
- service-only aggregate Console views;
- fixed search paths for privileged functions;
- existing C0-C4 authority remains controlling.

## Failure and rollback model

Repository changes are reversible through the CE-001 branch and PR. Supabase Test changes are additive and migration controlled. If a Test migration or verification fails, preserve the evidence and repair with an explicit corrective migration when the failed migration has already been durably recorded. Never describe a partially applied or unverified state as accepted.

Production activation is not part of CE-001.

## Future capability family

The architecture intentionally leaves room for separately accepted increments:

- CE-002 Recovery and Reorientation Protocol automation
- CE-003 Missingness and Forward Reasoning Scan
- CE-004 Friction and Failure Register workflows
- CE-005 Continuity Capsule capture integrations
- CE-006 Completion Evidence Standard
- CE-007 Continuous Eval and Regression Loop
- CE-008 Operational UX Review integration
- CE-009 Continuous Excellence Reviewer agent

These are capability boundaries, not placeholders. CE-001 implements the shared substrate they can reuse and each future increment must have its own issue, scope, verification, and acceptance evidence.
