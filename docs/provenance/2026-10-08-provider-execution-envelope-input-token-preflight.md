# Provider execution envelope and input-token preflight provenance

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/66
Authoritative base: `907c45bf24ff0ca29e3a725980941c35cf16289e`

## Purpose

Issue #66 establishes the immutable provider-execution identity and trustworthy input-token preflight contract needed before CoMind can connect the Issue #64 maximum-exposure quotation to Issue #59 durable budget reservation.

The contract is intentionally provider-execution oriented rather than assistant-route specific so it can be reused by chat, agents, workflows, tools, services, database operations, and future Virtual Employees.

## Source evidence

The repository pins OpenAI SDK `7.28.0` in both `server/package.json` and `server/package-lock.json`.

Exact SDK source for v7.28.0:

- https://github.com/openai/openai-node/blob/v7.28.0/src/resources/responses/input-tokens.ts

That SDK exposes `client.responses.inputTokens.count(...)` and sends the request to `POST /responses/input_tokens`.

Current OpenAI documentation reviewed on 2026-10-08:

- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count

The documentation states that the token-count endpoint returns the exact input count the model receives, accepts the Responses input representation, and includes structural formatting tokens such as message roles and boundaries. This is why character counts, message counts, and informal local token heuristics are not accepted as monetary authorization evidence.

The exact v7.28.0 TypeScript count request supports the current CoMind count-relevant request fields `model`, `input`, and `reasoning`. The count endpoint does not accept current response-only fields `store` or `max_output_tokens`. Those fields remain bound into the execution-envelope fingerprint even though they are not sent to the token-count endpoint.

No reviewed public OpenAI source found during this milestone states that `POST /v1/responses/input_tokens` is free of charge. Therefore no live input-token-count call is used for Issue #66 verification. A live count call remains prohibited unless billing behavior is established or Joseph explicitly authorizes it.

## Immutable envelope contract

Exactly one future provider execution is represented by a provider-execution envelope containing:

- schema version
- provider
- requested model
- canonical model identity where available
- processing mode
- execution role
- timeout policy
- retry policy
- exact provider request payload
- deterministic SHA-256 fingerprint

For the current OpenAI request, the exact provider request includes:

- requested model
- mapped provider input messages
- `store: false`
- reasoning effort
- `max_output_tokens`

The envelope does not contain API keys or credentials.

Envelope construction deep-copies the request into a canonical JSON-compatible representation and recursively freezes the result. Mutation of caller-owned source objects after construction therefore cannot change the execution request already authorized by the envelope.

The fingerprint is computed from deterministic canonical serialization with sorted object keys while preserving array order. It includes all envelope execution identity fields and the full provider request. The fingerprint itself is not included in its own hash input.

## Time-of-check/time-of-use invariant

The same immutable envelope is the authority for:

1. trustworthy input-token preflight,
2. future maximum-exposure quotation,
3. future durable reservation,
4. future provider execution,
5. future telemetry and settlement identity.

The current OpenAI provider now executes `envelope.request` directly. It no longer constructs one request for preflight identity and a second materially independent request for execution.

The input-token preflight result is bound to the exact envelope fingerprint. A changed provider, requested/canonical model, processing mode, execution role, timeout, retry policy, reasoning configuration, maximum output bound, provider input, or other request field changes the fingerprint and invalidates the earlier preflight.

Integrity is checked before and after the asynchronous token-count operation. The post-count check closes the in-process mutation window even though normal envelope construction already recursively freezes the data.

## Execution-role attribution

Current runtime provider construction now binds explicit roles:

- quality gate disabled: `root`
- quality gate draft pass: `draft`
- quality verifier: `verifier`
- quality repair pass: `repair`

The role is part of the envelope fingerprint and is also emitted in provider metadata with the request fingerprint, processing mode, requested/canonical model, timeout, and retry policy.

Issue #62 role-specific quality telemetry remains unchanged and continues to distinguish draft, verifier, and repair settlement evidence.

## Trustworthy token-count interface

The provider-neutral preflight interface accepts an immutable envelope and an injected token counter. A successful result records:

- provider
- counter identity
- envelope fingerprint
- exact input-token count

The preflight rejects negative, fractional, non-finite, unsafe, missing, or otherwise invalid counts. Counter failure propagates as a fail-closed preflight failure rather than falling back to a heuristic estimate.

A deterministic injected counter is available for tests so the full contract is verified without a network request.

The OpenAI adapter consumes the immutable OpenAI envelope and derives the v7.28.0 count body only from the envelope's `model`, `input`, and `reasoning` fields. Its input and reasoning references are the exact frozen objects held by the envelope.

## Canonical model reuse

Issue #66 does not introduce a second model alias or pricing catalog. OpenAI envelope construction reuses Issue #64's reviewed `quoteOpenAIProviderExposure` path with deterministic zero-input and one-output bounds solely to obtain its existing canonical model identity. Monetary output from that internal identity lookup is not used for authorization.

A later refactor may expose the reviewed canonicalization helper directly if another runtime surface requires it, but there remains one reviewed model/rate-card authority.

## Retry policy finding

Current runtime configuration permits SDK retries through `OPENAI_MAX_RETRIES`, default 2. A logical SDK `responses.create` invocation may therefore produce more than one provider HTTP attempt.

Issue #66 binds `max_retries` into execution identity but deliberately does not alter existing runtime behavior.

Before the future durable reservation wrapper is allowed to execute paid calls, retry exposure must be governed explicitly. The preferred design is to set provider-level automatic retries to zero in the governed execution path and represent each retry as a separately authorized attempt/envelope. An alternative is to reserve the conservative maximum exposure across every possible SDK attempt. The system must not reserve for one paid attempt while silently permitting several paid attempts.

## Deterministic verification

Tests cover:

- deep immutability and caller-input detachment
- deterministic SHA-256 fingerprints
- model, mode, role, timeout, retry, reasoning, output-bound, and input drift
- root, draft, verifier, and repair distinction
- exact preflight fingerprint binding
- malformed and unavailable token-count fail-closed behavior
- forged content retaining an old fingerprint
- exact OpenAI execution request object identity
- exact OpenAI count-relevant field derivation
- snapshot requested-model identity with reviewed canonical identity
- unchanged observed-usage cost semantics

No live OpenAI request is required by these tests.

## Safety state

For Issue #66 implementation and deterministic verification:

- no live Supabase mutation is required
- no paid model call is required
- no live input-token-count call is required
- no production deployment is required
- no credentials or secret values belong in the envelope or provenance

## Next layer

After Issue #66 is merged and permanent gates are green, the next coherent layer is the governed runtime provider-execution wrapper that consumes the same immutable envelope and performs:

immutable envelope -> trustworthy input count -> Issue #64 maximum-exposure quotation -> Issue #59 atomic durable reservation -> exact envelope execution -> authoritative provider telemetry -> Issue #62 role-correct settlement.

That later issue must settle retry authority before enabling paid execution.
