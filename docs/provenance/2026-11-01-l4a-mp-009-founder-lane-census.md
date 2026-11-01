# L4A-MP-009 Founder Lane Continuity Census

Date: 2026-11-01
Issue: #483
Depends on: L4A-MP-008
Production change: false
Paid-service commitment: false
Authority expansion: false

## Purpose

The management plane previously exposed durable lane data, but a founder still had to reconstruct several critical questions manually: whether a lane had an originating conversation, whether recovery returned work to that conversation, whether the controller still owned the lane, why a lane was waiting, and whether an `in_progress` record was actually active or simply stale.

MP-009 adds one private founder/controller read model for those questions without creating another source of truth.

## Reused authorities

The census reuses:

- `comind_pm.pm_work_items` for canonical lane identity and PM state
- the latest append-only RunBook event for lane evidence and next action
- MP-007 for exact originating conversation UUID and canonical URL
- MP-008 for mutable conversation title history
- MP-006 fields for return outcome and controller takeover prohibition
- the durable Recovery controller record for current recovery ownership

No conversation identity is inferred from a title, topic, or textual similarity.

## Private read model

`comind_pm.lane_continuity_census()` returns one JSON document containing:

- schema version and generation time
- six-hour dormant threshold
- classification precedence
- aggregate class counts
- one record for every canonical `item_type = lane`

Each lane record includes:

- work key, title, PM status, priority, area, owner and assignee
- current summary and durable activity timestamp
- deterministic continuity classification and exact classification basis
- latest RunBook outcome and next action when recorded
- exact conversation binding state
- exact ChatGPT conversation UUID and canonical URL when bound
- binding-observed title, current observed title, title event and title history count
- identity evidence reference
- durable GitHub issue, PR, branch, head and merge references when recorded
- MP-006 return status, return reason and human-readable why
- conversation returned and return impossible booleans
- recovery ownership release and controller implementation authority
- explicit external-input, human-action and blocker fields
- semantic verification metadata when durably recorded

Unknown values are left absent rather than inferred.

## Classification

The census uses this precedence:

1. `SUPERSEDED`
2. `COMPLETE`
3. `RECOVERY_OWNED`
4. `HUMAN_BLOCKED`
5. `WAITING`
6. `DORMANT`
7. `ACTIVE`

`DORMANT` is deterministic: an `in_progress` lane with no newer durable activity for six hours and no stronger explicit terminal, recovery, human, or wait state.

`WAITING` requires a canonical wait status or explicit external-input wait metadata. It is not assigned merely because a summary sounds passive.

`HUMAN_BLOCKED` requires an explicit human-action flag.

`RECOVERY_OWNED` requires the durable Recovery controller to select that lane while recovery ownership is explicitly unreleased.

## Conversation return semantics

A lane without a canonical MP-007 binding is exposed as:

- `bindingState = missing`
- `returnStatus = RETURN_UNAVAILABLE`
- `conversationReturned = false`
- `conversationReturnImpossible = true`
- `returnReason = conversation_binding_missing`

A retired binding is similarly explicit with `conversation_binding_inactive`.

A bound lane with no recorded return attempt is `NOT_ATTEMPTED`, not success.

Recorded MP-006 outcomes preserve exact return reason semantics. Controller ownership is never treated as ordinary implementation ownership.

## Verification

The isolated PostgreSQL 17 proof creates seven synthetic lanes and verifies exactly one instance of every required class:

- ACTIVE
- WAITING
- DORMANT
- HUMAN_BLOCKED
- COMPLETE
- SUPERSEDED
- RECOVERY_OWNED

It additionally proves:

- exact conversation identity is visible for a bound active lane
- MP-008 rename history is projected without changing identity
- missing bindings are founder-visible `RETURN_UNAVAILABLE`, not omitted
- recovery ownership remains unreleased when the controller says so
- `controllerMayContinueImplementation` remains false
- aggregate counts match detailed rows
- PUBLIC, anon and authenticated cannot execute the private census

## Operational use

The census is the durable database projection. Live GitHub state remains external operational evidence and should be reconciled into canonical lane metadata or RunBook events before being treated as durable state.

This separation is intentional: GitHub can answer what is live now; the RunBook and PM ledger answer what CoMind accepted and why. The census makes disagreements visible instead of silently choosing one source.
