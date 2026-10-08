# Provider Exposure Quotation Contract

## Milestone

GitHub Issue #64: https://github.com/jlhogarth/CoMind/issues/64

Branch: `issue-64-provider-exposure-quotation`

Base authoritative main: `392c45d145ed4bff565d9ca1b0d2637f7cf76555`

## Purpose

This milestone defines the deterministic pre-call monetary quotation layer that sits between bounded provider request policy and the existing durable paid-provider budget authority.

Its responsibility is narrow: for one already-bounded provider execution, calculate the maximum reviewed USD exposure that must be reserved before execution can be permitted.

The contract is execution-oriented rather than assistant-route-oriented. Future chat, agent, workflow, tool, service, database-operation, and Virtual Employee execution can reuse the same quotation semantics as long as the caller first establishes trustworthy request bounds.

## Source-of-truth hierarchy

- Monetary accounting authority remains the hardened Issue #57 FinOps contract.
- Current-runtime budget provenance remains the Issue #59 adapter, with Issue #62 role-to-telemetry provenance hardening.
- Observed provider pricing truth remains `server/src/providers/openai-rate-card.ts`.
- Provider settlement truth remains authoritative persisted provider telemetry in `comind.cm_message.meta`.
- This milestone does not create a second pricing catalog, accounting ledger, or runtime identity model.

## Current OpenAI quotation surface

`quoteOpenAIProviderExposure(...)` is implemented in `server/src/providers/openai-rate-card.ts` so it uses the same private reviewed rate-card objects as the existing observed-usage estimator.

Input contract:

- requested model;
- requested processing mode;
- validated maximum input-token bound;
- validated maximum output-token bound.

Successful output includes:

- provider;
- requested and canonical model identity;
- processing mode;
- selected short or long context band;
- maximum input and output token bounds;
- maximum USD exposure;
- USD currency;
- rate-card version;
- pricing source;
- explicit pricing assumption;
- exact input and output per-million rate basis used for the bound.

Unquotable output contains a null monetary exposure plus a machine-readable failure reason.

## Conservative pre-call pricing rule

A pre-call authorization cannot assume a cache hit or other discounted input classification that has not happened yet.

For the selected reviewed model, processing mode, and context band, the quote therefore derives the highest reviewed input-category rate from the existing rate card and prices every bounded input token at that rate.

The current GPT-6 Luna reviewed card makes cache-write pricing the highest input category. This is derived from the existing rate-card object rather than duplicated as a quotation constant.

The full bounded output is priced at the reviewed output-token rate for the selected context band.

This quotation is deliberately conservative. Actual settlement still uses observed persisted provider telemetry and the existing estimator after execution.

## Context-band rule

The existing reviewed rate card establishes a GPT-6 Luna long-context threshold of input tokens greater than 272,000.

Therefore:

- a maximum input bound of 272,000 selects short-context pricing;
- a maximum input bound of 272,001 selects long-context pricing;
- when the maximum bound crosses the threshold, the entire bounded request is quoted at the higher request band rather than using an optimistic blended rate.

## Output exposure rule

The quotation uses the request `max_output_tokens` value as the maximum billable output-token exposure.

The OpenAI Responses API documents `max_output_tokens` as an upper bound on generated output that includes reasoning tokens. The current CoMind runtime already constrains ordinary provider output through `OPENAI_MAX_OUTPUT_TOKENS` and verifier output through `ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS`.

## Fail-closed behavior

Quotation is refused for:

- unknown model;
- unsupported processing mode;
- missing maximum input bound;
- negative, fractional, non-finite, or non-safe-integer maximum input bound;
- missing maximum output bound;
- zero, negative, fractional, non-finite, or non-safe-integer maximum output bound.

An unquotable request never receives a guessed monetary exposure.

## Monetary precision

Maximum USD exposure uses the existing 12-decimal normalization rule already used by observed provider cost estimation and financial policy boundaries.

## Deterministic verification

`server/test/openai-provider-exposure-quote.test.mjs` verifies:

1. short-context quotation below the threshold;
2. short-context quotation exactly at 272,000 input tokens;
3. long-context quotation at 272,001 input tokens;
4. conservative cache-write input-rate selection;
5. no pre-call cached-input discount assumption;
6. full maximum output exposure;
7. Standard, Batch, Flex, and Fast multiplier reuse;
8. rate-card and pricing-source provenance;
9. 12-decimal monetary normalization;
10. snapshot model canonicalization;
11. unknown-model failure;
12. unsupported-mode failure;
13. missing-bound failure;
14. malformed numeric-bound failure;
15. unchanged observed-usage estimator semantics.

Permanent GitHub Actions remains the executable verification surface for this chat because the current shell environment cannot resolve `github.com` for a local clone. The connected GitHub surface remains authoritative for repository mutation and CI inspection.

## Explicit unresolved prerequisite

This milestone does not claim that the current assistant runtime already knows its maximum input-token count before provider execution.

Repository review found:

- retained history is message-count bounded, not token bounded;
- message content itself does not currently have a provider-token bound;
- verifier input includes conversation plus draft;
- repair input includes conversation plus draft plus verifier-derived information.

Therefore a caller must not derive the required `max_input_tokens` value from message count, character count, or an unverified heuristic.

A subsequent governed milestone must establish the trustworthy runtime source of the maximum input-token bound and then place reserve-before-call and settlement-after-persisted-telemetry around each provider execution independently, including draft, verifier, and repair calls.

## Safety record

- No paid provider call is part of Issue #64 implementation or deterministic verification.
- No live Supabase mutation is part of Issue #64.
- No production deployment is part of Issue #64.
- No credential or secret value is stored in this provenance record.
- No prompt or response content is stored in the financial quotation contract.
