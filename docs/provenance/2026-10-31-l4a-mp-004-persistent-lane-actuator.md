# L4A-MP-004 Provenance

Date: 2026-10-31
Issue: #460
Branch: `l4a-mp-004-persistent-lane-actuator`
Production change: false
Paid-service commitment: false

## Trigger

Joseph identified a continuity defect in the operating paradigm after AED proof: the assistant could correctly determine the next reversible authorized action, present it as a recommendation, and then wait for another conversational turn even though the standing CoMind Development Environment Contract already authorized execution.

Joseph explicitly selected L4A-MP-004 and directed development to proceed under the CoMind Application Development Contract. He also explicitly requested that the autonomous behavior be tightened so that already-authorized work does not stop for routine permission.

## Durable authority readback

Before implementation, the lane refreshed the canonical Development Environment Contract and the canonical CoMind evidence system. Durable evidence showed Joseph's standing L4A Bounded Autonomous Development Authority remains active and grants autonomous non-Production development, recovery, issue/branch/PR progression, qualifying merge, evidence capture, and dependency-valid continuation subject to existing mandatory human stops.

## Architectural finding

AED proved liveness classification, CLEAR-gated recovery, durable Temporal execution, lease/fencing, and semantic-progress verification. It did not create a provider-neutral actuator that can invoke every execution surface. In particular, a dormant ChatGPT conversation cannot truthfully be treated as an autonomously wakeable worker when no such actuator is available.

The correction has two parts:

1. governance: a Decision-Complete and No-Idle Continuation invariant that requires execution when authority and capability are already resolved;
2. runtime: a scheduler/actuator kernel that returns explicit `EXECUTE`, `WAIT`, `BLOCK`, `ESCALATE`, `UNAVAILABLE`, or `COMPLETE` dispositions and emits an idempotent execution envelope only when a matching actuator exists.

## Reuse

The first slice reuses:

- `server/lib/aed-liveness.js` for CLEAR and liveness semantics;
- `server/lib/l4a-semantic-progress.js` for normalized work-item and semantic-progress projection;
- canonical Foundry lease/fencing semantics as the required claim source;
- existing L4A management-plane authority and evidence hierarchy;
- existing governed GitHub/connector/workflow paths as the initial zero-cost repository execution surface.

No competing policy engine, scheduler authority, evidence ledger, or lease subsystem was introduced.

## Contract amendment

The canonical CoMind Development Environment Contract was versioned from 1.1 to 1.2 using Joseph's explicit authorization. Version 1.2 adds Decision-Complete and No-Idle Continuation.

A status report, recommendation, or heartbeat is no longer a valid stopping condition when a known next action is already authorized, dependency-valid, reversible, non-Production, and executable through an available governed execution surface.

Valid idle states are limited to bounded wait, active external execution, explicit dependency block, mandatory human/platform stop, unavailable actuator/substrate, or genuinely unresolved next action.

The amendment does not expand L4A authority or weaken any Production, security, financial, legal, credential, publication, irreversible-operation, or human-authorization boundary.

## Scheduler/actuator kernel

`server/lib/l4a-lane-actuator.js` implements:

- explicit continuation dispositions;
- deterministic repository actuator matching;
- active-claim duplicate-dispatch prevention;
- expired-claim canonical reacquisition intent;
- CLEAR evaluation before dispatch;
- explicit unsupported-surface `UNAVAILABLE` results;
- deterministic idempotency keys based on lane, next action, authority, execution surface, semantic progress, and optional dispatch generation;
- bounded `l4a.dispatch.v1` envelopes carrying evidence and canonical lease requirements;
- Production and paid-service fail-closed behavior.

The initial repository actuator is intentionally a dispatch-envelope boundary. It does not falsely claim that a host executed a GitHub mutation and it does not claim that a dormant ChatGPT conversation was awakened.

## Deterministic verification

Before repository mutation, the new kernel and its test file were executed locally under Node's built-in test runner. Eleven deterministic tests passed.

The tests prove:

1. authorized actionable repository work returns `EXECUTE`, not a recommendation;
2. bounded waits return `WAIT`;
3. explicit dependency blocks return `BLOCK`;
4. mandatory human stops return `ESCALATE`;
5. unsupported ChatGPT conversation surfaces return `UNAVAILABLE`;
6. active claims prevent duplicate dispatch;
7. expired claims require canonical lease reacquisition;
8. collision failure blocks through CLEAR;
9. missing durable L4A authority escalates rather than guessing authority;
10. idempotency is stable until semantic progress or dispatch generation changes;
11. unauthorized Production mutation remains a human gate.

Repository exact-head CI remains the acceptance authority before merge.

## Follow-on boundary

This first slice does not choose or purchase a persistent host. Successor work may bind the kernel to an always-on Temporal worker, event subscriptions, a local Ollama worker, a governed API-backed cognitive worker, CBE, or another execution substrate. Any such binding must preserve cost, secret, Production, and human-stop governance and must reuse the L4A-MP-004 scheduler contract rather than inventing a parallel management plane.
