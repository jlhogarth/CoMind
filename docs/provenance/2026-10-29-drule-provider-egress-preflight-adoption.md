# DRULE Provider Egress Preflight Adoption

Date: 2026-10-29
Issue: #185
Pull request: #293
Environment: CoMind Test and isolated CI
Production activation: false
Paid provider call: none

## Purpose

This checkpoint records the first product-path adoption of the shared RuleBook Control Plane at CoMind's governed provider-execution broker.

The change makes three existing successor controls mandatory before the governed broker may count provider tokens, quote exposure, reserve budget, admit a paid execution, or invoke the provider:

- `DRULE-C11` Prompt Injection & Exfiltration;
- `DRULE-C17` Multi-Tenancy & Isolation;
- `DRULE-C13` Network & Egress Control.

A decision of `deny` or `review`, a malformed decision, an unavailable evaluator, inconsistent tenant identity, or an undeclared governance-context field stops execution before provider work begins.

## Implementation boundary

The implementation adds a shared structured preflight helper and binds governed OpenAI execution to a trusted server-side destination contract:

- destination: `OPENAI-API`;
- host policy: `api.openai.com`;
- provider region token: `provider-managed`;
- normal action: `responses.create`;
- streaming action: `responses.create.stream`.

The caller does not supply or override those destination values.

The governance context contains structured control attributes only. Raw prompts, message content, secrets, credentials, tokens, authorization headers, or key material are not passed to RuleBook decision evidence.

## Test policy records

Supabase Test now contains one bounded synthetic governed asset and one bounded OpenAI destination policy for integration proof:

### Asset

- key: `PROVIDER-EXECUTION-TEST-INTERNAL`;
- classification: `INTERNAL`;
- tenant: `comind-test`;
- project scope: `COMIND`;
- allowed purpose: `provider-execution-test`;
- synthetic: true;
- production authority: false.

### Destination

- key: `OPENAI-API`;
- host: `api.openai.com`;
- maximum classification rank: 10, equivalent to `INTERNAL`;
- allowed region token: `provider-managed`;
- purpose required: true;
- human review required: true;
- production authority: false.

The destination record does not authorize a paid provider request. CoMind's separate paid-access approval and budget controls remain required.

## Live Test preflight proof

The canonical `comind_pm.governance_preflight` function was exercised with `record=false` after the Test seed was written.

Observed results:

| Control | Scenario | Result | Reason code |
| --- | --- | --- | --- |
| C11 | structured provider boundary, no secret request or escalation | allow | `TRUST_BOUNDARY_ACCEPTABLE` |
| C17 | same tenant and project | allow | `SAME_SCOPE` |
| C13 | INTERNAL asset, registered OpenAI destination, approved review | allow | `EGRESS_AUTHORIZED` |
| C13 | same request without human approval | review | `EGRESS_HUMAN_REVIEW` |
| C13 | same request with an unapproved region | deny | `EGRESS_REGION_NOT_ALLOWED` |

No external provider request was made during this proof.

## Exact-head CI proof

Implementation head `1a4c4f1f6c2b4306657a0044d6ddeaa95621de7a` passed the affected and broad verification matrix before this documentation checkpoint was added:

- Governed Provider Execution run `40814837515`: success;
- CINT-FINOPS-003 Provider Runtime Bridge run `40814837585`: success;
- Runtime Budget Authority Adapter run `40814837611`: success;
- CI run `40814837603`: success;
- Foundry Runtime Orchestration run `40814837451`: success;
- Foundry Work Lease Kernel run `40814837620`: success;
- Live Foundry Stage 1 Readiness run `40814837465`: success;
- Live Foundry LF-2 Readiness run `40814837487`: success;
- Live Foundry LF-3 Readiness run `40814837652`: success;
- DRB-002 Query Contract run `40814837490`: success;
- CoMind Repository Configuration run `40814837670`: success;
- No Placeholder Policy run `40814837553`: success;
- Lane Health Sentinel Observe run `40814837552`: success.

CP-01 Real Provider Substitution Proof run `40814837461` was skipped. Therefore this checkpoint incurred no paid provider proof call.

## Deliberate non-adoption boundary

The normal assistant runtime is not switched to this broker by this checkpoint.

The current assistant request contract has conversation identity and message content, but it does not yet carry a canonical RuleBook governed-asset classification. Wiring C13 into that path without first solving classification would require one of two unsafe shortcuts:

1. silently treating unknown conversation content as `INTERNAL`, which can underclassify sensitive data; or
2. treating all unknown content as a higher class, which would intentionally block current OpenAI operation.

Neither shortcut is accepted.

Before the normal assistant path becomes RuleBook-gated, CoMind needs a durable conversation or outbound-payload governance binding whose classification, tenant, project scope, purpose, and human approval are derived from authoritative server-side state. Missing classification should fail closed rather than receiving a permissive default.

## Foundry boundary

Foundry adapter dispatch is also not changed by this checkpoint. The shared preflight helper is intended for reuse there, but Foundry adoption remains a separate slice so its established leasing, authorization, and live Test proofs can be reviewed independently.

## Acceptance statement

This checkpoint proves a reusable fail-closed RuleBook gate at the governed provider broker while preserving existing budget, retry, replay, FinOps, Foundry, Conversation History, RLS, and Production boundaries.

It does not claim that all provider traffic is governed yet. The remaining work is to bind real assistant conversations to authoritative data-governance state, then route the normal provider path through the governed broker, followed by a separate Foundry adapter adoption slice.
