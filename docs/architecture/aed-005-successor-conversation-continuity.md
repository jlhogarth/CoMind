# AED-005 Successor Conversation Continuity

Status: implementation candidate
Issue: #504
Environment: Test-first
Production activation: excluded

## Objective

AED-005 separates logical CoMind lane continuity from any individual ChatGPT conversation instance.

The durable invariant is the development lane, not the browser conversation. After semantic recovery is verified, AED may prefer the canonical originating conversation, but failure or unavailability of that conversation is not a terminal lane state when authoritative durable continuity state is sufficient.

## Decision model

The continuity coordinator distinguishes:

- `RECOVERY_INCOMPLETE`
- `ORIGINAL_RETURN_PENDING`
- `ORIGINAL_ACTIVE`
- `SUCCESSOR_REQUIRED`
- `SUCCESSOR_PENDING`
- `SUCCESSOR_ACTIVE`
- `CONTINUITY_BLOCKED`

A successful original return remains preferred. A pending original return is not raced by successor creation.

`RETURN_FAILED` and `RETURN_UNAVAILABLE` may transition to successor reconstruction only when the durable continuity state is explicitly verified and contains a work key, verified checkpoint, and next dependency-valid action.

Missing durable state blocks reconstruction. AED must not invent missing context to keep a lane moving.

## Reuse

AED-005 does not create a competing continuity store. It composes existing CoMind systems:

- CE Continuity Capsules for durable objective and recovery state;
- ThreadKeeper accepted handoff lineage;
- ACP checkpoint and Foundry reconciliation;
- Durable RunBook chronology and current lane state;
- GitHub and other approved authoritative observations;
- L4A-MP-006 original-conversation return semantics;
- CBE persistent Playwright browser profile;
- Foundry lease and fencing verification.

## Successor Continuity Capsule

The browser actuator receives a bounded reconstruction payload containing only the information needed to resume the logical lane:

- continuity identity;
- lane identity;
- work key;
- verified checkpoint;
- next dependency-valid action;
- authority reference;
- optional issue, branch, PR, and exact head SHA;
- optional predecessor conversation reference SHA-256;
- bounded provenance references.

Raw predecessor conversation URLs are not part of the capsule contract. Cookies, passwords, MFA values, browser storage, lease tokens, and other authentication material are rejected by the strict runtime schema.

## Browser behavior

The successor actuator uses the existing persistent Playwright profile.

Before posting anything, it must verify that navigation to `https://chatgpt.com/` did not resolve to an existing stable conversation URL. If an existing conversation is already active, the actuator fails closed rather than risk posting the reconstruction payload to an unrelated conversation.

The actuator then:

1. verifies that the ChatGPT composer is available;
2. posts the bounded successor continuity message;
3. verifies the exact continuity marker appears as a user message;
4. observes a non-empty assistant response following that message;
5. verifies that ChatGPT assigned a stable `/c/...` conversation URL;
6. returns the stable successor binding to the caller;
7. writes only the SHA-256 of that binding to redacted evidence.

The predecessor may be marked superseded only after those verification steps succeed.

## Authority and ownership

AED-005 does not expand authority.

Successor creation requires the existing CLEAR decision and canonical Foundry lease/fencing reference. The browser actuator cannot grant authority.

After successful original return or successor activation, AED does not retain ordinary implementation ownership. The active conversation becomes the lane execution surface under the existing CoMind Application Development Contract and L4A authority.

## Failure semantics

Recoverable successor failures remain `SUCCESSOR_REQUIRED`, not silent lane abandonment. Non-recoverable continuity failures become `CONTINUITY_BLOCKED` with an explicit reason.

This allows conversation failure to be treated as an execution-surface fault while preserving the durable logical lane.

## Verification

Deterministic tests cover:

- semantic progress required before transfer;
- original return preference;
- no successor race while original return is pending;
- failed or unavailable original conversation selecting successor reconstruction;
- insufficient durable state blocking reconstruction;
- successor actuator unavailability remaining retryable;
- strict runtime rejection of raw auth material and raw predecessor conversation URLs;
- canonical lease/fencing enforcement;
- response-start verification;
- stable successor URL verification;
- private successor URL excluded from redacted evidence;
- predecessor superseded only after verified successor activation;
- AED ordinary implementation ownership remains false.

Exact-head CI is the acceptance gate. Live browser acceptance is a separate non-Production proof after this contract is merged and an authenticated CBE runtime is available.
