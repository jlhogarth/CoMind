# PRO-100 credit-first integration

Issue #578, GOV-DEV-016. Development/Test, November 22, 2026. The canonical standing rule is the Development Environment Contract v1.5; this page applies it to the CoMind Pro 100 program without creating a separate billing authority.

## Current account evidence

Joseph confirmed Pro 100 on November 22. A ChatGPT account readback observed 91% shared weekly Work/Codex allowance and 300 personal usage credits, and verified that personal-credit automatic reload was turned off. Those figures are neither API credits nor permanent balance values. OpenAI documents a $100 full-period monthly API benefit after at least seven days of qualifying paid subscription; the first grant may be prorated and expires at the subscription billing-cycle end. No authoritative API organization grant, project, balance or recharge readback has occurred. The benefit is **pending**, not $100 available to spend. Official source: https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions . Private account observations: https://docs.google.com/document/d/15ANDnYH-8_OulxEuZfwuG2kdAl9rwthZOBYUagZMz_k/edit .

## Operative sequence

1. Use deterministic/local work when adequate. For hosted inference, discover all included and credit-funded routes before any additional cash route. Do not spend API credits merely to reduce an unrelated ChatGPT allowance meter.
2. On or after actual eligibility, inspect ChatGPT's claim offer and the intended API organization's Credit grants and billing settings. Verify same-email owner, organization/project identity, existing credential dependencies, grant amount, balance, expiry, any purchased credits, and recharge state. Do not switch organizations blindly or disclose keys.
3. For each proposed request, check model/tool eligibility, source and pricing, required quality, latency, retention, privacy, and authority. Record the workload and project, estimated maximum consumption, current grant balance, expiry and receipt timestamp. Recheck before each dispatch, reserve against concurrent work through existing FinOps authority, and block a retry that could consume purchased credits without separate approval.
4. A natural-language instruction is not a platform billing hold. If no enforceable paid fallback stop is demonstrable, fail closed before the known grant boundary; report the unsupported operation. No auto recharge, purchase, Production activation, or new provider is authorized here.
5. Reconcile the provider usage and grant debit independently. Report actual invoiced cash, benefit-credit use, purchased-credit use, estimates and Work/Codex allowance observations in their own domains. Unknown is null. Unused grant is not cash savings without evidence of an expense it displaced.

The existing Compute Router has a credit-evidence gate for its `API_BATCH` and `API_REALTIME` paths. It does not contact OpenAI, reserve funds, or intercept every provider call. The FinOps owner must bind this decision to its existing reservation and provider receipt before a live automated claim of enforcement. FlowOps #546 and FinOps #550 retain their separate ownership. No API call is made to validate this rule.

## Acceptance status

- [x] Founder-approved standing policy is represented in the canonical repository contract and AGENTS.md.
- [x] Deterministic route checks cover unknown, stale, wrong-scope, partial, expired, and spillover-unsafe grant evidence.
- [ ] Actual Pro API grant readback after eligibility, intended organization and project match, and enforceable spending stop.
- [ ] Live caller binding to FinOps reservation and provider billing readback.
- [ ] Approved grant-bounded Test request with actual provider usage and grant reconciliation.

Do not mark the remaining checks complete from documentation, a local test, or a successful router recommendation.
