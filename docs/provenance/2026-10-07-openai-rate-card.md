# OpenAI rate card and deterministic estimator

Date: 2026-10-07
Issue: #34
Branch: `issue-34-openai-rate-card`
Base main: `bb9861791ba77eff2c91ba83b3e2681acecf8c1a`

## Purpose

Add a reviewed, versioned, cache-aware OpenAI pricing source and persist estimated provider cost in USD without guessing unknown prices.

## Authoritative pricing source

OpenAI API pricing: https://developers.openai.com/api/docs/pricing
GPT-6 Luna model pricing: https://developers.openai.com/api/docs/models/gpt-6-luna
Prompt caching accounting: https://developers.openai.com/api/docs/guides/prompt-caching

Pricing was reviewed on 2026-10-07.

For GPT-6 Luna Standard processing, short-context prices per 1M tokens are:

- input: $0.10
- cached input: $0.01
- cache write: $0.125
- output: $0.50

For requests with more than 272,000 input tokens, long-context prices per 1M tokens are:

- input: $0.20
- cached input: $0.02
- cache write: $0.25
- output: $0.75

OpenAI documents Batch and Flex at 50% of Standard and Fast at 2x Standard for this model.

## Accounting rule

OpenAI prompt-caching documentation states that cache-write pricing is not additive. Input tokens are partitioned among uncached input, cached input, and cache-write tokens. The estimator therefore computes:

`uncached_input = input_tokens - cached_input_tokens - cache_write_tokens`

It rejects inconsistent usage where cached-input plus cache-write tokens exceed total input tokens. It also leaves unknown models unpriced instead of guessing.

## Implementation

- Added `server/src/providers/openai-rate-card.ts`.
- Added rate-card version `openai-2026-10-07` and authoritative source URL.
- Added short/long context support at the documented 272K threshold.
- Added Standard, Batch, Flex, and Fast processing modes to the rate-card module.
- The current synchronous Responses runtime explicitly estimates against Standard processing rather than inferring another mode.
- Added deterministic cost calculation for uncached input, cached input, cache writes, and output.
- Added fail-closed behavior for unknown models and invalid usage accounting.
- Added snapshot-model normalization for known GPT-6 Luna snapshots.
- Added `server/test/openai-rate-card.test.mjs` with deterministic coverage.
- Wired reviewed estimates into successful OpenAI response metadata and failed empty-output response diagnostics when usage exists.
- Updated integration fixtures so estimated cost is verified after database persistence and conversation reload.
- Updated the guarded live smoke contract to require a reviewed rate-card version, numeric cost estimate, pricing source, Standard processing mode, and persisted cost equality.
- Normalized USD estimates to 12 decimal places to prevent binary floating-point artifacts from polluting financial telemetry.

## Verification history

Initial estimator-only checkpoint passed all three pull-request workflows: Repository Configuration, No Placeholder Policy, and CI.

The first runtime-wiring CI run exposed one deterministic unit-test mismatch caused by JavaScript floating-point representation: `0.000005060000000000001` versus `0.00000506`. TypeScript build and all other observed pricing tests passed. The estimator was corrected to normalize USD estimates to 12 decimal places rather than weakening the test.

Final post-fix CI is required before PR readiness or merge.

## Safety

No paid OpenAI API request was made for Issue #34 implementation or testing. Live Supabase was not mutated. No credentials were read, printed, or committed.
