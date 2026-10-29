# TK-011 - Decision Reconsideration Triggers

Status: Implementation candidate  
Capability: ThreadKeeper  
Issue: #308  
Production activation: false  
Schema change: none in this slice

## 1. Purpose

TK-011 preserves why a decision was accepted, which alternatives were rejected, and the explicit future conditions that justify reopening review. A satisfied trigger does not reverse the decision. It produces a governed request for independent review.

This implements the CoMind four-sided decision framework through references to:

- evidence supporting the accepted choice;
- evidence defeating or weakening it;
- costs/opportunity costs of choosing it;
- costs/opportunity costs of rejecting it.

Rejected alternatives retain their rejection reasons and remain historically visible.

## 2. Trigger model

A reconsideration trigger targets one or more rejected alternatives and contains one or more conditions. v1 requires all conditions to be satisfied.

Supported condition kinds:

- numeric threshold;
- external state;
- policy version change;
- continuity dependency checkpoint change;
- time/expiry boundary;
- arrival of an evidence class.

The trigger stores explicit evidence and source references, creation time, and current/retired lifecycle state.

ThreadKeeper does not monitor providers, prices, policies, dependencies, or external systems by itself. Owning systems supply observations.

## 3. Evidence observations

Observations must be explicit evidence. Model guesses or unsupported assertions are rejected.

Each observation binds to one trigger and one condition, carries provenance/evidence references and time, and either:

- reports an observed value; or
- invalidates earlier evidence.

For a condition with multiple observations, the latest observation wins deterministically. A later invalidation prevents older matching evidence from silently satisfying the trigger.

## 4. Evaluation

Trigger states:

- `UNRESOLVED`: no conditions currently satisfied;
- `PARTIALLY_SATISFIED`: at least one but not all conditions satisfied;
- `SATISFIED`: every condition satisfied;
- `INVALIDATED`: trigger retired or current evidence invalidates a condition.

Threshold comparisons require matching metric and unit references. External-state, policy, dependency, and evidence-arrival conditions require exact reference matches. Expiry conditions are evaluated against an explicit evaluation timestamp.

The result preserves condition-level status, observation identity, evidence, the decision record digest, and a deterministic evaluation digest.

## 5. Review boundary

Only a `SATISFIED` trigger can create a `DecisionReconsiderationReviewRequest`.

The request is intentionally bounded:

- `recommendedRoute = OPEN_CONTINUITY_REVIEW`
- `authorityMode = requires_independent_review`
- `automaticDecisionChange = false`

ThreadKeeper cannot replace the accepted option, activate a rejected alternative, accept a successor checkpoint, or grant authority. Any change remains subject to the ordinary governed decision and checkpoint-acceptance path.

## 6. Ownership boundaries

TK-011 does not own:

- external monitoring;
- market or provider facts;
- policy authority;
- decision approval;
- task execution;
- automatic rollback or migration;
- checkpoint acceptance;
- truth determination.

It preserves continuity of decision rationale and recognizes when explicit reconsideration conditions have evidence sufficient to justify review.

## 7. Failure posture

Fail closed on:

- record integrity failure;
- unknown rejected alternative targets;
- duplicate trigger/condition IDs;
- missing rejection reasons or trigger evidence;
- unsupported trigger matching semantics;
- observations without explicit evidence;
- observation/condition type mismatch;
- unknown conditions;
- evaluation before trigger creation;
- tampered evaluation passed to review creation;
- any attempt to create a review request from a non-satisfied trigger.

## 8. Acceptance

Repository acceptance requires:

1. deterministic decision record with four-sided analysis and rejected alternatives;
2. deterministic trigger evaluation across all supported condition kinds;
3. partial, satisfied, unresolved, retired, and invalidated cases proven;
4. latest-evidence invalidation proven;
5. unit/state/type mismatches fail safely;
6. satisfied trigger routes only to independent review and cannot mutate the decision;
7. TK-008/TK-009/TK-010 and broad server regressions remain green;
8. exact-head CI passes;
9. no schema/RLS/grant/Production mutation.
