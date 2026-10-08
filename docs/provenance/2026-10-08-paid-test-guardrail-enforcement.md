# Paid OpenAI Smoke Guardrail Enforcement Provenance

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/55
Pull request: https://github.com/jlhogarth/CoMind/pull/56
Base main: `e56323ce6988ae6433c803f868d7488750a80343`

## Purpose

Issue #55 turns the read-only spending guardrail introduced by Issue #53 into an enforced pre-request boundary for the manual paid OpenAI smoke workflow.

The smoke workflow uses a disposable isolated `comind_runtime` database. That database does not retain spending telemetry across independent workflow dispatches, so its history-based guardrail must not be represented as a durable cross-run budget control.

## Layered enforcement

The manual paid smoke path now combines:

1. Runtime preflight against `/api/analytics/spending-guardrail` before `/assistant-response` can trigger an external provider request.
2. Fail-closed handling for `pause`, unavailable guardrail state, malformed JSON, unknown decisions, malformed reasons, and inconsistent `decision` versus `pause_paid_tests` state.
3. Explicit `warn` behavior. Warnings are written to operator-visible output and may proceed for this manual verification path.
4. Deterministic per-dispatch bounds:
   - allowlisted model: `gpt-6-luna`
   - reasoning effort: `low`
   - maximum output tokens: 128
   - timeout ceiling: 30000 ms
   - provider retries: 0
   - logical paid requests per dispatch: 1
   - metered assistant quality gate: disabled
5. Existing workflow and database safety boundaries remain in place: manual `workflow_dispatch`, isolated PostgreSQL 17 plus pgvector, database name `comind_runtime`, local-host validation, credential masking, and no live Supabase use.

## Verification strategy

Deterministic tests cover:

- accepted bounded runtime policy
- rejection of additional provider retries
- rejection of oversized output-token limits
- `allow` behavior
- operator-visible `warn` behavior
- `pause` blocking
- malformed and inconsistent guardrail state
- unavailable guardrail endpoint behavior
- non-success guardrail HTTP behavior
- static ordering proving the preflight invocation occurs before the `/assistant-response` provider trigger in the smoke script

Permanent PR verification is tracked by GitHub Actions on PR #56. The authoritative final status is the current PR check suite and its linked workflow runs.

## Architectural boundary and follow-on

This milestone bounds each paid smoke dispatch but does not implement a durable cross-run spending ledger. If CoMind requires a hard budget shared across workflow runs, environments, or provider execution surfaces, that budget source must be durable and independent of the disposable smoke database. It should become a separate governed milestone after Issue #55 is complete.

## Safety record

No paid OpenAI request is required to implement or deterministically verify this milestone. No live Supabase mutation or production deployment is part of Issue #55. No credential value is stored in repository content or provenance.