# AED-002 Temporal Durable Liveness Substrate

Status: accepted end-to-end proof in isolated non-Production Test
Parent policy milestone issue: #447
Policy slice: PR #448
Temporal runtime issue: #451
Temporal runtime PR: #453
CLEAR-gated recovery issue: #455
CLEAR-gated recovery PR: #456
Accepted recovery head: `308683f835f5c4de511245f3e3a9b53ad4f55861`
Accepted merge commit: `bb966ba3bd8bfe4be47c63b5cefbaa01e62d0c31`
Reconciliation issue: #457
Production change: false

## Decision

AED separates CoMind liveness policy from durable orchestration mechanics. CoMind remains authoritative for semantic progress, CLEAR governance, intervention levels, canonical evidence, recovery authority, and escalation. Temporal supplies durable workflow history, timers, Signals or Updates, Activity heartbeats, retries, and Worker recovery.

GitHub `on: schedule` is not a timely execution dependency. It may remain only as a dead-man or reconciliation layer.

Wake precedence is:

`event -> durable timer -> adaptive poll -> fixed poll`

The accepted AED recovery cycle is:

`SENSE -> DIAGNOSE -> CLEAR -> SHOCK -> VERIFY -> ESCALATE`

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

The Temporal Workflow is deliberately deterministic. It receives serializable CoMind wake and recovery inputs rather than reading operational systems directly. Workflow code performs no direct GitHub, database, filesystem, network, or ordinary wall-clock I/O. External state transitions enter through Temporal-safe Signals or inputs. The absence of an event is handled by a durable Temporal timer. Side-effecting work is isolated in Activities.

The accepted runtime uses official Temporal TypeScript SDK packages pinned exactly to `1.25.0` under Node 24. Local/Test execution uses the official Temporal CLI development service image `temporalio/temporal:1.9.1`. No Temporal Cloud account or paid Temporal service is required for the accepted proof.

## Verified AED-002B runtime proof

GitHub Actions run `41185141947` executed the runtime proof against a real local Temporal service.

Verified behavior:

- external Signal won before its 2500 ms fallback timer;
- absent external Signal produced a durable timer wake after the adaptive 1000 ms fallback;
- a Workflow was observed in its waiting state, the first Worker was shut down, a second Worker joined the same task queue, the same Workflow Execution replayed from history, and the post-restart Signal completed it;
- Activity heartbeats advanced `lastObservedAt` while the original semantic `lastProgressAt` value remained unchanged;
- Recovery Sweep, Dev Supervisor, GitHub cron, paid Temporal, Production changes, and model/API calls were not used for runtime acceptance.

Durable runtime evidence:

`docs/provenance/2026-10-31-aed-002b-temporal-runtime-proof.json`

## Semantic progress invariant

Temporal Activity heartbeat is execution-liveness evidence, not semantic-progress evidence. A heartbeat can prove that an Activity Worker is alive and making execution progress, but it cannot overwrite, refresh, or substitute for CoMind semantic `last_progress_at`.

This distinction is required so a repeatedly heartbeating but semantically stalled lane can still become diagnosable and recoverable.

## Verified AED-002C unattended recovery proof

Issue #455 and PR #456 completed the remaining AED recovery acceptance. The accepted exact head was `308683f835f5c4de511245f3e3a9b53ad4f55861`. All 17 observed pull-request workflows completed successfully, including `AED-002C CLEAR Recovery Proof`, before merge commit `bb966ba3bd8bfe4be47c63b5cefbaa01e62d0c31` entered `main`.

The proof demonstrated, in isolated non-Production Test:

1. a synthetic actionable lane with accepted semantic progress and an expired expected-progress deadline;
2. deterministic classification of the lane as `STALLED` without treating heartbeat or observation as progress;
3. diagnosis of one exact safe reversible recovery action;
4. CLEAR evaluation from observable Test facts before mutation;
5. canonical Foundry lease and fencing verification before recovery mutation;
6. one authorized synthetic recovery action executed exactly once;
7. a new accepted semantic progress event caused by recovery;
8. advancement of `last_progress_at` only from accepted semantic progress;
9. bounded no-mutation escalation when CLEAR fails;
10. no mutation when lease or fencing state is stale;
11. bounded causal evidence and Operator Console-ready projections for recovered and blocked outcomes;
12. acceptance without Recovery Sweep, Dev Supervisor, a ChatGPT turn, GitHub cron timing, Joseph action, paid provider/model execution, private credentials, or Production mutation.

The initial AED-002C integration proof failed because the workflow used plain PostgreSQL 17 while the canonical Foundry substrate requires the `vector` extension. The repair reused the established `pgvector/pgvector:0.8.6-pg17-bookworm` CI substrate rather than creating a competing database fixture. The repaired exact head passed the full acceptance suite.

## Issue lineage reconciliation

The AED proof evolved through dependency-valid successor slices while preserving one issue = one branch = one PR:

- Issue #442 / PR #443 established the AED foundation.
- PR #444 established semantic-progress liveness and stalled-lane recovery planning.
- Issue #447 / PR #448 established adaptive liveness policy.
- Issue #451 / PR #453 established the durable Temporal runtime.
- Issue #455 / PR #456 established CLEAR-gated unattended recovery acceptance.
- Earlier umbrella Issue #452 / PR #454 was superseded by the finer-grained successor slices and is closed unmerged.

The canonical RunBook work item `AED-002` is reconciled to `done` with end-to-end recovery proven and Production change set to false.

## Accepted capability boundary

This milestone proves that CoMind can detect a semantic stall, durably survive worker interruption, wake from events or timers, fail closed through CLEAR, claim recovery work through canonical lease/fencing semantics, perform an authorized reversible Test recovery, and verify real semantic progress afterward without relying on a ChatGPT turn or scheduled GitHub polling as the timely liveness mechanism.

This proof does not authorize Production activation, an always-on Production Temporal deployment, new infrastructure spend, broader autonomous mutation authority, or bypass of existing human/platform stop boundaries.

## Post-proof operationalization boundary

Any next AED operationalization milestone must start as a new governed issue, branch, and PR under the CoMind Application Development Contract. It must independently define its authority, environment, cost boundary, deployment model, recovery path, evidence contract, and acceptance criteria.

In particular, a persistent or always-on AED service, real-lane autonomous mutation expansion, new paid infrastructure, or any Production activation remains outside this accepted proof and requires the applicable L4A, RuleBook, cost, security, collision/freshness, and Production gates.

Completed proof issues and branches must not be reopened merely to extend scope. The accepted proof is the baseline for successor work.
