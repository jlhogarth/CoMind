# AED-002 Temporal Durable Liveness Substrate

Status: runtime binding proven in Test; unattended recovery remains open
Parent milestone issue: #447
Policy slice: PR #448
Runtime binding issue: #451
Runtime binding PR: #453
Production change: false

## Decision

AED-002 separates CoMind liveness policy from durable orchestration mechanics. CoMind remains authoritative for semantic progress, CLEAR governance, intervention levels, canonical evidence, and escalation. Temporal supplies durable workflow history, timers, Signals or Updates, Activity heartbeats, retries, and Worker recovery.

GitHub `on: schedule` is not a timely execution dependency. It may remain only as a dead-man or reconciliation layer.

Wake precedence is:

`event -> durable timer -> adaptive poll -> fixed poll`

## State-driven adaptive liveness

There is no universal expected job duration. Timing evidence is conditioned on the job and lifecycle state. Queue delay and execution duration are distinct observations.

The policy slice implements:

- lifecycle-specific wake planning;
- job -> family -> lifecycle -> system -> conservative static cold-start fallback;
- P50/P75/P90/P95/P99 duration summaries;
- low observation pressure during normal early execution;
- tighter observation near the historical tail;
- P95 overrun as a diagnosis trigger, never as implicit recovery authority;
- event preference with a calculated durable timer fallback;
- bounded-wait wake-condition enforcement;
- no polling for human-blocked work.

The policy module and tests are ESM-compatible and are included in the standard server `npm test` suite.

## Temporal runtime boundary

The Temporal Workflow is deliberately deterministic. It receives a serializable CoMind wake plan as input rather than reading operational systems directly. It performs no direct GitHub, database, filesystem, network, or wall-clock I/O. External state transitions enter through a Temporal Signal. The absence of an event is handled by a durable Temporal timer. Side-effecting work is isolated in Activities.

The AED-002B runtime uses official Temporal TypeScript SDK packages pinned exactly to `1.25.0` under Node 24. Local/Test execution uses the official Temporal CLI development service image `temporalio/temporal:1.9.1`. No Temporal Cloud account or paid Temporal service is required.

## Verified AED-002B proof

GitHub Actions run `41185141947` executed the runtime proof against a real local Temporal service.

Verified behavior:

- external Signal won before its 2500 ms fallback timer;
- absent external Signal produced a durable timer wake after the adaptive 1000 ms fallback;
- a Workflow was observed in its waiting state, the first Worker was shut down, a second Worker joined the same task queue, the same Workflow Execution replayed from history, and the post-restart Signal completed it;
- Activity heartbeats advanced `lastObservedAt` while the original semantic `lastProgressAt` value remained unchanged;
- Recovery Sweep, Dev Supervisor, GitHub cron, paid Temporal, Production changes, and model/API calls were not used for acceptance.

Durable evidence:

`docs/provenance/2026-10-31-aed-002b-temporal-runtime-proof.json`

## Semantic progress invariant

Temporal Activity heartbeat is execution-liveness evidence, not semantic-progress evidence. A heartbeat can prove that an Activity Worker is alive and making execution progress, but it cannot overwrite, refresh, or substitute for CoMind semantic `last_progress_at`.

This distinction is required so a repeatedly heartbeating but semantically stalled lane can still become diagnosable and recoverable.

## Remaining AED-002 milestone work

The next successor slice must bind the proven durable liveness mechanics to CoMind stall diagnosis and CLEAR-gated recovery. It must then execute the parent milestone unattended acceptance test:

1. deliberately stall a synthetic non-Production Test lane;
2. detect the semantic stall without a ChatGPT turn, Recovery Sweep, Dev Supervisor, or GitHub cron timing dependency;
3. diagnose the exact recovery action;
4. pass every mutation through CLEAR and existing authority boundaries;
5. claim recovery work using canonical lease/fencing semantics;
6. execute authorized recovery or stop at the smallest explicit escalation when unauthorized;
7. verify resumed semantic progress;
8. project state transitions and causality into canonical evidence and the Operator Console.

AED-002 remains open until that unattended recovery acceptance is proven.
