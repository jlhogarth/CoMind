# CGA-002 governed assistant provider Test canary

Date: 2026-10-29
Issue: #302
Environment: repository/isolated CI and Supabase Test only
Production authority: false
Paid provider authority: false

## Purpose

Prove that a normal assistant request can be composed through the authoritative conversation governance resolver, deterministic C11 observation, and the existing governed OpenAI execution broker without making a paid or external provider call.

## Composition

`GovernedOpenAIAssistantProvider` composes existing CoMind capabilities rather than introducing another policy path:

1. resolve authoritative conversation governance using `resolveConversationExecutionGovernance`;
2. derive C11 structured observations locally using `observeC11TrustBoundary`;
3. construct RuleBook execution context from stored conversation scope and review state;
4. use the existing database RuleBook evaluator;
5. build the existing immutable OpenAI provider envelope;
6. invoke `executeGovernedOpenAIProviderExecutionEnvelope`.

Destination identity remains server-bound by the existing OpenAI governed execution wrapper as `OPENAI-API` / `provider-managed` / `responses.create`. Classification, tenant, project, purpose, and egress approval are not accepted from caller request content.

## Canary safety

No real OpenAI client is used for live acceptance in this milestone. The isolated broker contract uses fake provider/token/budget/ledger dependencies. The live Supabase Test portion is limited to a dedicated synthetic conversation plus authoritative resolver and RuleBook preflight calls.

No paid API proposal, paid execution, budget reservation, provider token-count request, or model request is authorized by CGA-002.

The existing assistant provider outside the synthetic canary remains unchanged in this slice. This avoids silently changing operational traffic while proving the governed composition needed for later rollout.

## Acceptance matrix

The isolated contract must prove:

1. secret-disclosure request is denied by DRULE-C11 before token counting, budget reservation, or provider execution;
2. authority-escalation request is denied by DRULE-C11 before token counting, budget reservation, or provider execution;
3. unapproved untrusted side effect returns `review` before token counting or provider execution;
4. approved benign request passes C11, C17, and C13, reaches a deliberately denying Test budget authority, and still performs zero provider calls;
5. a fully approved all-fake path reaches the fake provider only after all broker gates and returns governed execution receipt metadata;
6. governance telemetry contains structured attributes only and never copies raw prompt content;
7. `maxRetries` must be zero for governed assistant execution.

## Live Test canary

A single dedicated synthetic conversation will be created under canonical CoMind Test scope and bound to the RuleBook as `INTERNAL`, residency `COMIND-TEST-US`, retention `OPERATIONAL`, purpose `assistant-response`, destination `OPENAI-API`.

A time-bounded human egress review will be recorded under the Founder instruction to perform these next steps while retaining the separate paid-provider approval rule. The live proof will call the governance resolver and structured RuleBook preflight only. It will not invoke OpenAI.

## Cross-lane boundaries

- CHIST-K01 #247 remains untouched.
- VE lifecycle PR #301 changes only the VE lifecycle coordinator and does not overlap this provider adapter.
- Operator Console production deployment issues #294-#297 remain untouched.
- Foundry runtime remains unchanged until its separate later slice.
