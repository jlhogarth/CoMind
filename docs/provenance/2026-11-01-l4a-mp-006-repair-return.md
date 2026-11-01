# L4A-MP-006 Repair-and-Return Continuity

## Purpose

Close the control-plane defect in which AED, Supervisor, or Recovery can advance repository state without returning the repaired lane to its canonical originating development conversation or explicitly reporting why that return was impossible.

## Founder clarification

A repository-level repair is not sufficient evidence of lane recovery. After verified semantic recovery, the system must either:

1. return the lane to its canonical originating conversation and verify resumed response generation; or
2. emit an explicit founder-visible return failure containing the exact machine reason code and a human-readable explanation of why return was impossible.

Silence is not an acceptable return state.

## Ownership invariant

AED recovery ownership is temporary. The recovery controller may repair and verify the smallest bounded fault. It must not silently become the long-lived implementation worker for the recovered lane.

After semantic progress is verified, normal implementation remains owned by the durable lane and its registered originating execution surface. If conversation return fails, the controller may retry the bounded return when the failure is recoverable, but it may not continue ordinary lane implementation merely because the conversation could not be awakened.

## Return states

- `RECOVERY_INCOMPLETE`: semantic recovery is not yet verified; recovery work may continue.
- `RETURN_PENDING`: recovery is verified and a governed return attempt is required.
- `RETURNED`: the bounded handoff appeared in the registered conversation and resumed response generation was observed.
- `RETURN_FAILED`: the governed return actuator ran but verification failed; the exact reason and why are required.
- `RETURN_UNAVAILABLE`: return cannot currently be attempted because a prerequisite such as a canonical conversation binding or actuator is absent; the exact reason and why are required.

## Explicit return reasons

The implementation provides deterministic explanations for at least:

- missing, inactive, or invalid canonical conversation binding;
- unavailable conversation actuator;
- CLEAR denial;
- missing, invalid, expired, or stale lease/fencing state;
- registered/target/final conversation identity mismatch;
- missing ChatGPT authentication;
- browser start, interruption, or timeout;
- missing composer;
- handoff not observed;
- resumed response not observed;
- generic handoff verification failure.

Unknown reason codes remain visible rather than being collapsed into a generic success or silent wait.

## Founder-visible contract

Every repair-and-return outcome projects:

- work key;
- recovery/return status;
- whether the conversation was returned;
- whether return was impossible;
- exact return reason code;
- human-readable reason why;
- whether recovery ownership was released;
- whether the controller may retry return;
- whether the controller may continue ordinary implementation.

`controllerMayContinueImplementation` is false for every post-repair return state.

## Current operational finding

At implementation time, the durable conversation governance binding table contained only a synthetic Test binding. This explains why prior Recovery Sweep actions could reconcile GitHub lanes without knowing which real ChatGPT conversation should receive the repaired work. Real lane-to-conversation registration is therefore a required operationalization step for broad repair-and-return coverage.

## Scope and boundaries

This slice is non-Production and does not grant new authority, create paid commitments, expose browser session material, or weaken CLEAR, lease/fencing, freshness, collision, or one-issue/one-branch/one-PR controls.

CBE-002 remains the governed ChatGPT handoff actuator. L4A-MP-006 orchestrates ownership and outcome semantics around it rather than duplicating browser automation.
