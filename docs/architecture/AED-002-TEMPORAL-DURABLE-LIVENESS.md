# AED-002 Temporal Durable Liveness Substrate

Status: implementation started
Issue: #447
Production change: false

## Decision

AED-002 separates CoMind liveness policy from durable orchestration mechanics. CoMind remains authoritative for semantic progress, CLEAR governance, intervention levels, canonical evidence, and escalation. Temporal is the preferred durable execution substrate for workflow history, timers, signals/updates, activity heartbeats, retries, and worker recovery.

GitHub `on: schedule` is not a timely execution dependency. It may remain only as a dead-man/reconciliation layer.

Wake precedence is:

`event -> durable timer -> adaptive poll -> fixed poll`

## State-driven adaptive liveness

There is no universal expected job duration. Timing evidence is conditioned on the job and lifecycle state. Queue delay and execution duration are distinct observations.

The first executable slice implements:

- lifecycle-specific wake planning;
- job -> family -> lifecycle -> system -> conservative static cold-start fallback;
- P50/P75/P90/P95/P99 duration summaries;
- low observation pressure during normal early execution;
- tighter observation near the historical tail;
- P95 overrun as a diagnosis trigger, never as implicit recovery authority;
- event preference with a calculated durable timer fallback;
- bounded-wait wake-condition enforcement;
- no polling for human-blocked work.

## Temporal boundary

The Temporal integration must preserve deterministic Workflow code. Side effects belong in Activities. A lane Workflow receives external state transitions through Signals or Updates, waits on durable timers when events are absent, and calls Activities only after CoMind CLEAR authorizes the intended mutation.

The initial adaptive timing engine is deliberately substrate-independent so its policy can be deterministically tested before binding it to a Temporal Worker.

## Required next slice

Bind the adaptive policy to a local/Test Temporal Workflow and Worker using pinned official Temporal TypeScript SDK packages. Prove timer wake, Signal wake, worker interruption/replay, activity heartbeat semantics, and CLEAR-gated recovery without Production activation or paid services.

## Acceptance boundary

AED-002 is not complete until an unattended synthetic Test lane can be deliberately stalled and either recover to verified semantic progress or reach an exact bounded escalation without a ChatGPT turn, manual Recovery Sweep, or GitHub cron dependency.
