# CBE-003 Durable Self-Hosted ChatGPT Handoff Actuator

Date: 2026-11-01
Issue: #480
Production change: false
Paid-service commitment: false
Authority expansion: false

## Purpose

CBE-002 proved the exact-conversation browser handoff engine, but the engine existed only as an importable library. CBE-003 provides the bounded runtime entrypoint required by MP-006 recovery-and-return semantics.

A recovery controller can now submit one exact ChatGPT handoff job to a self-hosted Node and Playwright runtime. The actuator verifies the canonical Foundry lease, opens only the exact registered ChatGPT conversation, posts the bounded recovery handoff, verifies that the handoff appears, verifies that assistant response generation starts, closes the browser context, and emits one machine-readable MP-006 return result.

## Runtime entrypoint

After `npm run build` in `server/`:

```text
npm run cbe:chatgpt-handoff -- /absolute/path/outside/repository/handoff-job.json
```

The job may instead be supplied on stdin, which is preferred when a caller can avoid writing the lease capability reference to disk.

Required environment:

- `DATABASE_URL`: database containing the canonical Foundry work lease
- `CBE_PROFILE_DIR`: persistent Chromium profile directory outside the repository
- `CBE_HEADLESS`: optional `true` or `false`, default `true`

The external job JSON contains the existing governed CBE-002 job contract: job identity, exact target URL, exact registered URL, timeout, Foundry lease reference, authority reference, CLEAR approval, and bounded recovery handoff data.

The parser is strict. Browser cookies, session values, passwords, MFA material, storage state, arbitrary tokens, and unknown payload fields are rejected. The Foundry `leaseToken` remains part of the pre-existing lease capability contract but is never written to emitted evidence.

## Persistent browser authentication

ChatGPT authentication lives only in the external persistent Chromium profile identified by `CBE_PROFILE_DIR`. The profile must never be stored inside the repository, committed to GitHub, embedded in a handoff job, or emitted as evidence.

A human may bootstrap or refresh that profile through an interactive Playwright/Chromium session. After authentication, headless recovery attempts may reuse the same external profile. If the profile is no longer authenticated, the actuator returns `authentication_required`; it does not silently navigate to another account or claim success.

## MP-006 result contract

Every completed actuator attempt emits:

- `returnStatus`: `RETURNED`, `RETURN_FAILED`, or `RETURN_UNAVAILABLE`
- `conversationReturned`
- `conversationReturnImpossible`
- `returnReason`
- `returnWhy`
- `retryEligible`
- `ownershipReleased=true`
- `controllerMayContinueImplementation=false`
- redacted bounded evidence

A successful return requires both:

1. exact handoff delivery observed in the registered conversation
2. assistant response generation observed

A posted message without observed response start is not success.

Known failure reasons remain specific, including lease and fencing failures, exact identity mismatch, browser startup failure, authentication required, composer missing, handoff not observed, response not observed, timeout, and verification failure.

## Idempotency

The handoff contains a recovery ID. If the exact conversation already contains that recovery marker, CBE-002 reports `already_delivered` and CBE-003 maps it to `RETURNED` without posting a duplicate message.

## Live proof

The live proof is intentionally opt-in and requires an external authenticated profile plus a real governed lease.

```text
CBE_LIVE_CHATGPT_PROOF=true \
CBE_HANDOFF_JOB_FILE=/absolute/path/outside/repository/handoff-job.json \
CBE_PROFILE_DIR=/absolute/path/outside/repository/chromium-profile \
DATABASE_URL=postgresql://... \
npm run cbe:chatgpt-live-proof
```

The proof refuses to run unless `CBE_LIVE_CHATGPT_PROOF=true`. It asserts `RETURNED`, `conversationReturned=true`, ownership release, and continued prohibition on controller implementation takeover.

## Recovery-controller integration

The controller sequence is:

1. detect stalled lane
2. acquire governed recovery ownership and valid Foundry lease
3. repair bounded defect
4. verify semantic progress
5. resolve exact originating conversation through MP-007/MP-008
6. construct bounded CBE handoff job
7. invoke CBE-003
8. record exact return result
9. release recovery ownership
10. stop controller implementation authority

If CBE-003 cannot return the conversation, MP-006 still requires explicit founder-visible reason reporting. Failure never authorizes the recovery controller to absorb ordinary lane implementation.
