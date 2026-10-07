# Metered answer quality gate

Date: 2026-10-07
Issue: #35
Branch: `issue-35-metered-quality-gate`
Base main: `d0ba829e3af773ab202e5a282379bba1db51872a`
PR: #37

## Purpose

Add a risk-gated answer verification layer that reduces unnecessary verifier spend while preserving per-pass usage, estimated cost, verdict, critique, and final outcome telemetry.

## Architecture

The quality gate is implemented as an `AssistantProvider` wrapper rather than inside the HTTP route or database layer. This keeps generation, verification, repair, metering, and outcome selection composable while preserving the existing assistant route and `cm_message` persistence contract.

Control flow:

1. Generate one draft through the configured assistant provider.
2. Classify risk using deterministic request signals.
3. Return low-risk drafts without invoking a verifier.
4. Invoke a provider-backed verifier only for high-risk requests.
5. Return approved drafts.
6. Invoke a provider-backed repairer when the verifier requests revision.
7. Persist controlled blocked assistant outcomes for reject and abstain verdicts so critique and cost telemetry are durable.
8. On verifier failure, fail closed by default with a persisted blocked outcome; an explicit configuration can return the draft marked `returned_unverified`.

The verifier and repairer use raw provider instances under the quality-gate wrapper, preventing recursive verification.

## Runtime configuration

The quality gate is disabled by default.

- `ASSISTANT_QUALITY_GATE`: `disabled` or `metered`; default `disabled`.
- `ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK`: `block` or `return_draft`; default `block`.
- `ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS`: bounded 64 through 1024; default `256`.

The draft and repair passes retain the normal `OPENAI_MAX_OUTPUT_TOKENS` budget. The verifier receives its smaller dedicated output budget to limit verifier tax.

## Deterministic risk signals

The initial classifier elevates requests when it detects:

- tool output in conversation history,
- time-sensitive or current-information language,
- high-stakes medical, legal, tax, credit, mortgage, investment, or financial-advice language,
- an explicit request for sources, citations, evidence, verification, or fact-checking,
- calculation or numeric-reasoning language.

These signals are conservative and auditable routing signals. They are not claims that an answer is correct or incorrect.

## Provider-backed verification and repair

The verifier receives the conversation and draft through a dedicated provider request and must return one strict JSON object containing:

- verdict: `approve`, `revise`, `reject`, or `abstain`,
- concise critique,
- zero or more reviewed issue categories.

Malformed JSON, unsupported verdicts, unsupported issue categories, and verifier provider failures enter the configured verifier-failure path. When provider metadata exists on a failure, the consumed verifier usage and estimated cost remain attached to quality telemetry.

The repair pass receives the original conversation, draft, verifier critique, and issue categories and returns the corrected final answer. It is invoked only for `revise` verdicts.

## Telemetry

The quality gate stores compact telemetry only. It does not duplicate prompt or response payloads inside telemetry.

Each provider-backed pass may retain:

- pass role,
- provider,
- model,
- endpoint,
- response id,
- status,
- duration,
- usage,
- estimated cost.

Quality metadata records:

- risk level and deterministic reasons,
- verifier verdict,
- issue categories,
- final outcome,
- bounded critique up to 1000 characters,
- pass telemetry,
- whether the final output came from draft, repair, or a controlled block.

## Persistence behavior

Low-risk returned answers, repaired answers, and controlled blocked outcomes use the existing assistant route and are persisted as normal assistant messages with `quality_gate` metadata. This ensures reject, abstain, and verifier-failure telemetry is durable instead of existing only in process logs.

## Deterministic verification scope

Tests cover:

- low-risk verifier skip and zero verifier calls,
- high-risk approve,
- revise plus repair,
- reject,
- abstain,
- verifier failure with default fail-closed behavior,
- explicit fail-open fallback marked unverified,
- malformed verifier output,
- unsupported verifier verdict and issue categories,
- critique trimming and length bounding,
- preservation of metering on draft, verifier, failed-verifier, and repair passes,
- bounded quality-gate environment configuration,
- database-backed persistence and reload of skip, repaired, and blocked outcomes.

## Safety and cost boundary

No live paid provider request is required for Issue #35 implementation tests. The runtime feature is disabled by default. Live Supabase is not mutated. No credentials are required or committed. A future paid quality-gate smoke must remain a final verification step after deterministic CI is green and must use the existing guarded cost-control policy.
