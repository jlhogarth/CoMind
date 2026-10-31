# AED-003 Temporal Runtime and Unattended Recovery

Status: implementation and runtime proof in progress
Issue: #452
Production change: false
Paid Temporal service: false

## Purpose
AED-003 completes the runtime portion that remained after AED-002 PR #448 merged the substrate-independent adaptive liveness policy. The split restores the CoMind `one issue = one branch = one PR` invariant without relaxing any remaining acceptance requirement.

## Authority boundary
Temporal supplies durable execution mechanics. It does not become the semantic authority for CoMind.

CoMind remains authoritative for:
- semantic progress;
- CLEAR recovery authorization;
- recovery scope and escalation;
- canonical evidence meaning;
- human authority;
- Operator Console interpretation.

GitHub scheduled workflows are not the timely liveness clock. They may only serve reconciliation or dead-man purposes outside this proof.

## Runtime topology
The Test proof uses:

`Temporal CLI development service -> durable AED lane Workflow -> signal or durable timer -> heartbeat Activity -> semantic stall diagnosis -> CLEAR gate -> recovery Activity -> verification -> canonical evidence`

The local Temporal service is started with `temporal server start-dev --headless`. No Temporal Cloud account or paid Temporal service is required.

## Version policy
AED-003 pins the required official Temporal TypeScript SDK packages coherently at `1.24.0`:
- `@temporalio/activity`
- `@temporalio/client`
- `@temporalio/worker`
- `@temporalio/workflow`

The integration workflow pins Temporal CLI `v1.9.1` and verifies the SHA-256 digest of the Linux amd64 release archive before execution.

## Deterministic Workflow boundary
`aed003LaneController` is the durable Workflow. It:
- receives an external Signal as the event-first wake path;
- waits on a Temporal durable timeout when the event is absent;
- records exact wake cause;
- invokes Activities for all side effects;
- determines semantic stall state from `lastProgressAt`, never from `lastObservedAt`;
- requires CLEAR before scheduling a recovery mutation;
- returns bounded state transitions and causality.

Workflow time uses Temporal replay-safe Workflow time through the SDK-controlled `Date` implementation. Native platform or network side effects do not occur inside Workflow code.

## Activity boundary
Activities perform:
- canonical Test evidence append;
- Temporal Activity heartbeats;
- CLEAR-defended recovery mutation;
- semantic recovery verification.

The heartbeat Activity carries the existing semantic progress timestamp in heartbeat details but cannot advance it. A recent heartbeat can therefore prove worker liveness while the lane remains semantically stalled.

## Unattended worker restart proof
The integration harness starts worker A, starts a durable lane Workflow, confirms worker-A waiting evidence, and terminates worker A with `SIGKILL`. The Temporal service remains alive while the durable fallback deadline passes. Worker B then starts on the same task queue and must resume the existing Workflow from Temporal history.

Acceptance requires evidence from both worker identities and a successful timer-driven recovery result after the interruption.

## Signal wake proof
A second lane uses a materially longer adaptive fallback delay and receives an external Signal. The Signal must complete the wake path before the durable fallback deadline and the Workflow must report wake cause `event`.

## Adaptive timing proof
The harness derives two different delays from two measured synthetic job-duration histories through the AED-002 adaptive policy. The proof rejects a universal interval by asserting that the two derived delays differ and preserve their relative workload scale.

## CLEAR and escalation proof
An authorized stalled lane may execute the bounded Test recovery Activity and must verify that semantic progress advances.

An otherwise identical lane without CLEAR authorization must terminate at escalation `CLEAR_REQUIRED`. Its transition history must contain no `recovery_mutation` event.

## Evidence and projection
Each Activity-side transition is appended to bounded JSONL evidence with the executing worker identity. Workflow results preserve ordered transitions and causality. `projectLaneResult` converts the result into an Operator Console-ready projection without making the projection authoritative over the underlying evidence.

The integration artifact contains:
- generated npm lock state;
- Temporal CLI version;
- Temporal SDK version;
- Temporal service log;
- canonical transition JSONL;
- unattended proof JSON.

## Acceptance exclusions
The unattended proof does not use:
- a ChatGPT turn as the liveness clock;
- manual Recovery Sweep intervention;
- Dev Supervisor intervention;
- GitHub scheduled workflow timing;
- Production infrastructure;
- paid Temporal service;
- paid model/provider execution;
- private live capture.

GitHub Actions is only the isolated Test host that starts the local Temporal service and workers. Temporal history, Signals, timers, and worker task queues provide the liveness mechanics inside the proof.

## CBE relationship
CBE-001 is available as a governed execution substrate where browser interaction is materially useful. AED-003 does not require CBE for its internal liveness clock and does not depend on browser automation for the unattended Temporal proof.
