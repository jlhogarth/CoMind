# API-KEY-001 OpenAI credential readiness

Date: 2026-11-02
Issue: #520
Environment: GitHub Actions / Development verification
Production activation: false
Paid model execution: none

## Purpose

API-KEY-001 verifies that the OpenAI API credential stored in GitHub Actions as `OPENAI_API_KEY` is presently accepted by OpenAI and can access CoMind's configured `gpt-6-luna` model.

It deliberately does not prove or authorize paid inference. DRULE-003 remains authoritative for normal configured OpenAI assistant execution.

## Why this proof is separate

The historical `Guarded OpenAI Live Smoke` last succeeded on 2026-10-07, but its underlying `scripts/verify_openai_live.sh` path was later disabled by DRULE-003 because it predated authoritative conversation governance and paid-access controls.

Credential readiness and paid provider readiness are different questions:

- Credential readiness: Is the configured secret present, accepted by OpenAI, and authorized to see the configured model?
- Paid provider readiness: Does a specific governed conversation have current RuleBook egress approval, an approved paid-access proposal, a budget-authority binding/reservation, and permission to perform the bounded model request?

API-KEY-001 answers only the first question.

## Live readiness contract

The manual `OpenAI API Key Readiness` GitHub Actions workflow:

1. reads `OPENAI_API_KEY` only from GitHub Actions secrets;
2. refuses to run when the secret is absent;
3. performs exactly one credential-readiness operation against `GET https://api.openai.com/v1/models`;
4. sends no prompt, conversation content, embeddings input, tool arguments, or other CoMind data;
5. requires an HTTP success response;
6. requires `gpt-6-luna` to be present in the returned model list;
7. does not print the secret, Authorization header, or raw response body;
8. does not call `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings`, or `/v1/batch`;
9. produces no model output and does not constitute billable inference.

## Deterministic test coverage

`server/test/openai-api-key-readiness.test.mjs` verifies:

- successful credential/model readiness;
- exact OpenAI host and GET-only request contract;
- no request body;
- missing-key fail-closed behavior;
- 401/403 rejection handling;
- network failure handling;
- malformed response handling;
- required-model absence handling;
- static prohibition of paid inference endpoints in the readiness workflow path;
- no workflow printing of `OPENAI_API_KEY`.

The implementation accepts an injected fetch implementation for deterministic tests. The live workflow alone uses the real network.

## Current governance state at implementation

Read-only Supabase verification on 2026-11-02 established:

- no current `comind.cm_budget_authority_binding` rows;
- no approved OpenAI paid-access proposal;
- the most recent conversation egress approval expired on 2026-10-30;
- therefore a real model-generation smoke is correctly blocked until a new bounded paid execution is separately authorized and governed.

This is not evidence of an API-key failure. It is evidence that CoMind's paid execution controls are fail-closed.

## OpenAI configuration baseline

Current OpenAI documentation confirms:

- application API authentication uses a secret bearer credential;
- server-side environment variables or a secret manager are the recommended storage boundary;
- API keys must not be committed to source or exposed in client-side applications;
- `gpt-6-luna` is a current API model available through the Responses API;
- current pricing is dynamic external evidence and must not be hard-coded into credential logic.

CoMind follows this boundary by keeping the secret in GitHub Actions/runtime secret storage while committing only the environment-variable name.

## Recovery

API-KEY-001 is additive. Rollback removes:

- `server/lib/openai-api-key-readiness.js`;
- `server/scripts/openai-api-key-readiness.mjs`;
- `server/test/openai-api-key-readiness.test.mjs`;
- `.github/workflows/openai-api-key-readiness.yml`;
- this provenance document.

Rollback must not reactivate the retired ungoverned paid smoke path.

## Next paid-provider gate

After credential readiness succeeds, a separate governed paid verification may be prepared with:

- a synthetic governed conversation;
- current time-bounded OpenAI egress approval;
- an OpenAI paid-access proposal with current sourced rate-card evidence;
- explicit human approval of the bounded maximum spend;
- a matching budget-authority binding/reservation;
- zero automatic retries;
- one bounded model request;
- execution and cost reconciliation evidence.

Until that gate is satisfied, `ASSISTANT_PROVIDER=openai` must remain fail-closed when its required authority identities are absent.
