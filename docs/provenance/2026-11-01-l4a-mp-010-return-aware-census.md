# L4A-MP-010 Return-Aware Lane Census

Date: 2026-11-01
Issue: #487
Depends on: L4A-MP-009
Production change: false

## Reason for successor correction

The first live MP-009 census correctly exposed durable lane state but revealed two classification defects:

1. `NOTEBOOK-001` had a recent recovery event with `RETURN_UNAVAILABLE / conversation_actuator_unavailable`. Because the recovery event refreshed activity time, MP-009 classified the lane ACTIVE even though normal continuation could not resume.
2. `PFC-001` had an explicit durable blocker requiring a valid native OpenAI export. Because the blocker did not also carry the newer `external_input_status` field, MP-009 classified the lane DORMANT.

Both states are operationally WAITING. Recent controller/recovery activity must not make a blocked lane appear executable, and an explicit blocker must outrank age-based dormancy.

## Classification precedence

MP-010 preserves the existing precedence:

1. SUPERSEDED
2. COMPLETE
3. RECOVERY_OWNED
4. HUMAN_BLOCKED
5. WAITING
6. DORMANT
7. ACTIVE

Within WAITING, the deterministic bases now include:

- `explicit_conversation_return_wait`: latest durable or canonical metadata has `returnStatus` equal to `RETURN_UNAVAILABLE` or `RETURN_FAILED`
- `explicit_blocker_wait`: latest durable event or canonical metadata has a nonempty blocker
- `canonical_pm_wait_status`
- `explicit_external_input_wait`

HUMAN_BLOCKED remains reserved for an explicit human-action-required flag. RECOVERY_OWNED remains higher precedence when bounded recovery ownership is still unreleased.

## Temporal semantics

The census remains a STABLE function and MP-010 uses `current_timestamp` for the six-hour dormancy snapshot, generated-at value, and hours-since-activity calculation. This makes one invocation internally time-consistent.

## Return semantics

MP-010 does not alter MP-006 return fields. It only makes classification respect them.

A bound lane with `RETURN_UNAVAILABLE` remains:

- `conversationReturned=false`
- `conversationReturnImpossible=true`
- exact `returnReason`
- exact `returnWhy`
- `controllerMayContinueImplementation=false`

It now classifies WAITING until the return condition changes.

## Verification

The PostgreSQL 17 harness first reruns the complete MP-009 seven-class baseline after MP-010 is installed, proving no regression to ACTIVE, WAITING, DORMANT, HUMAN_BLOCKED, COMPLETE, SUPERSEDED, or RECOVERY_OWNED semantics.

A second MP-010 proof then verifies:

- a recent exact-bound lane with `RETURN_UNAVAILABLE` classifies WAITING with basis `explicit_conversation_return_wait`
- an old lane with an explicit blocker classifies WAITING with basis `explicit_blocker_wait`
- an unblocked recent lane remains ACTIVE
- an unblocked stale lane remains DORMANT
- census schema version advances to 2
