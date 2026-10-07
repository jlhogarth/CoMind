# Metered answer quality gate

Date: 2026-10-07
Issue: #35
Branch: `issue-35-metered-quality-gate`
Base main: `d0ba829e3af773ab202e5a282379bba1db51872a`

## Purpose

Add a risk-gated answer verification layer that can reduce unnecessary verifier spend while preserving per-pass usage and cost telemetry.

## Initial architecture

The quality gate is implemented as an `AssistantProvider` wrapper rather than inside the HTTP route or database persistence layer. This keeps generation, verification, repair, metering, and outcome selection composable while preserving the existing route and persistence contract.

Initial control flow:

1. Generate one draft through the configured assistant provider.
2. Classify risk using deterministic request signals.
3. Return low-risk drafts without invoking a verifier.
4. Invoke an injected verifier only for high-risk requests.
5. Return approved drafts.
6. Invoke an injected repairer when the verifier requests revision.
7. Block reject or abstain verdicts.
8. On verifier failure, fail closed by default; an explicit configuration can return the draft marked `returned_unverified`.

## Deterministic risk signals

The initial classifier elevates requests when it detects:

- tool output in conversation history,
- time-sensitive/current-information language,
- high-stakes medical, legal, tax, credit, mortgage, investment, or financial-advice language,
- an explicit request for sources, citations, evidence, verification, or fact-checking,
- calculation or numeric-reasoning language.

These signals are intentionally conservative and auditable. They are routing signals, not claims that an answer is correct or incorrect.

## Telemetry

The quality gate stores compact telemetry only. It does not duplicate prompt or response content in telemetry.

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
- whether final output came from draft or repair.

## Verification scope

The first deterministic test layer covers:

- low-risk verifier skip,
- high-risk approve,
- revise plus repair,
- reject,
- abstain,
- verifier failure with default fail-closed behavior,
- explicit fail-open fallback marked unverified,
- critique trimming and length bounding,
- preservation of metering on draft, verifier, and repair passes.

No live paid provider request is required for this implementation slice. Live Supabase is not mutated. No credentials are required or committed.
