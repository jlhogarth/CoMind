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

## Isolated broker acceptance

The dedicated exact-head canary workflow passed on candidate `dac2c3b293212a9395105878dcdac7732dee415f`.

It proved:

1. a secret-disclosure request is denied by DRULE-C11 before token counting, budget reservation, or provider execution;
2. an authority-escalation request is denied by DRULE-C11 before token counting, budget reservation, or provider execution;
3. an unapproved untrusted side effect returns `review` before token counting or provider execution;
4. an approved benign request passes C11, C17, and C13, reaches a deliberately denying Test budget authority, and still performs zero provider calls;
5. a fully approved all-fake path reaches the fake provider only after all broker gates and returns governed execution receipt metadata;
6. governance telemetry contains structured attributes only and never copies raw prompt content;
7. governed assistant execution requires `maxRetries=0`.

The CP-01 Real Provider Substitution Proof was independently checked on the same candidate and concluded `skipped`. No real provider substitution ran.

## Live Supabase Test canary

A dedicated persistent synthetic conversation was created:

- conversation ID: `c9a20000-0000-4000-8000-000000000002`;
- source: `cga_test`;
- environment: Test;
- canonical CoMind organization/project scope;
- metadata explicitly states `paid_provider_authority=false`.

It was bound to RuleBook governance as:

- classification: `INTERNAL`, rank 10;
- residency: `COMIND-TEST-US`;
- retention: `OPERATIONAL`;
- purpose: `assistant-response`;
- destination: `OPENAI-API`.

A time-bounded egress approval was recorded as review event `d5ebc7d7-ac36-4f7a-a4b1-39d29e34ad1e`. The approval expires at `2026-10-30T06:32:23.164775+00:00`. Its authority basis explicitly preserves the separate paid-provider approval requirement.

The authoritative resolver returned the exact expected conversation asset, canonical tenant/project scope, `INTERNAL` classification, `assistant-response` purpose, `OPENAI-API` destination, `approved` review state, and bounded expiry.

Structured live RuleBook decisions were then recorded without prompt text:

- DRULE-C11 benign approved input: `allow`, reason `TRUST_BOUNDARY_ACCEPTABLE`;
- DRULE-C17 same tenant/project: `allow`, reason `SAME_SCOPE`;
- DRULE-C13 approved registered Test egress: `allow`, reason `EGRESS_AUTHORIZED`;
- DRULE-C11 secret-disclosure signal: `deny`, reason `UNTRUSTED_SECRET_REQUEST`;
- DRULE-C11 authority-escalation signal: `deny`, reason `UNTRUSTED_AUTHORITY_ESCALATION`.

Paid-provider state was counted before and after the live proof. Both reads returned:

- paid API executions: 0;
- API cost receipts: 0;
- budget authority reservations: 0.

Therefore CGA-002 performed no paid execution, no budget reservation, no provider token-count call, and no model request.

Durable PM verification event: `09131c94-32e0-44c0-9d27-904403674735`, outcome `pass`.

## Cross-lane boundaries

- CHIST-K01 #247 remains untouched.
- VE lifecycle PR #301 changes only the VE lifecycle coordinator and does not overlap this provider adapter.
- Operator Console production deployment issues #294-#297 remain untouched.
- Foundry runtime remains unchanged until its separate later slice.
- Production assistant behavior remains unchanged.

## Final merge gate

The live Test canary is complete. Merge remains gated on a fresh exact-head CI and cross-lane regression matrix for this documentation-complete candidate, followed by a current `main` conflict check.
