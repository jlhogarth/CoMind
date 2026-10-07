# OpenAI rate card and deterministic estimator

Date: 2026-10-07
Issue: #34
Branch: `issue-34-openai-rate-card`
Base main: `bb9861791ba77eff2c91ba83b3e2681acecf8c1a`

## Purpose

Add a reviewed, versioned, cache-aware OpenAI pricing source before CoMind reports estimated provider cost in USD.

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

## Initial implementation chunk

- Added `server/src/providers/openai-rate-card.ts`.
- Added rate-card version `openai-2026-10-07` and authoritative source URL.
- Added short/long context support at the documented 272K threshold.
- Added Standard, Batch, Flex, and Fast processing modes.
- Added deterministic cost calculation for uncached input, cached input, cache writes, and output.
- Added fail-closed behavior for unknown models and invalid usage accounting.
- Added snapshot-model normalization for known GPT-6 Luna snapshots.
- Added `server/test/openai-rate-card.test.mjs` with deterministic coverage.

## Verification state

Repository CI verification is pending at this checkpoint. No paid OpenAI API request was made. Live Supabase was not mutated. No credentials were read, printed, or committed.
