# NCAP-001: credit funding preflight checkpoint

**Date:** November 26, 2026 (Indiana). **Tier:** T1 reversible Development/Test.
**Ownership:** successor issue #590 to GOV-DEV-016 #578; PR #579 is merged.

## Handoff and observed baseline

The prior NCAP-001 conversation stopped after identity verification. The current Work conversation assumed implementation control. Repository main was `9c7e759b2db342a56d6eccb3ac238c8cddcf409b` at branch creation. The configured assistant constructs `GovernedOpenAIAssistantProvider` for root or draft, verifier and repair roles. It already invokes RuleBook preflight, exact input count, FinOps budget reservation and paid execution admission. Its prior implementation had no grant funding check before input counting. The separately exported direct assistant adapter and streaming paths remain separate callers; they do not establish comprehensive credit-first enforcement.

The private account inspection did not establish an eligible promotional grant or a verified grant-only spending stop. The detailed account and billing observations remain in the access-controlled NCAP-001 Operations Page and are deliberately excluded from this public repository. Never substitute a prior UI observation for a fresh provider receipt or a provider-side grant-only cap.

## Bounded change

The existing governed execution pipeline accepts an optional funding preflight after RuleBook approval and before the input-token counter. Both OpenAI governed response and streaming wrappers supply an explicit *unbound* preflight when none is provided. It raises `CREDIT_FUNDING_AUTHORITY_UNBOUND`, so the configured runtime path cannot reach provider token counting, the existing FinOps reservation or provider dispatch while no real funding authority is wired. Synthetic tests may inject an explicit test preflight; these are isolated fixtures and confer no live spending authority.

This does not reserve grant funds, validate account or project identity, prove a paid fallback stop, change billing settings, or make the direct `OpenAIAssistantProvider` safe. The configured assistant still uses the governed class. Because an approved funding preflight implementation does not yet exist, deploying this change with `ASSISTANT_PROVIDER=openai` will reject otherwise authorized OpenAI responses. Do not promote until a validated FinOps-backed implementation, account/grant proof and compatibility review exist.

## Forward impact and rollback

- Intended effect: prevent the configured assistant from using the existing API balance or automatic recharge merely because its ordinary budget reservation approved a request.
- Consequence: OpenAI backed assistant generation fails closed after RuleBook allow, before token counting. Other non-OpenAI routes are untouched. This is a deliberate availability tradeoff pending funding-bound execution.
- Security: a caller-provided callback is an extension seam, not proof of funding authority. A future binding must use a trusted, scoped source and a shared atomic FinOps reservation, recheck exposure immediately before dispatch, and reconcile uncertain provider consumption.
- Reversal: revert the issue #590 change or switch the assistant provider to its existing disabled mode in Test. No database or account mutation is involved. Production deployment requires separate approval.

## Verification and continuation

`npm run build` and the focused tests in `openai-funding-preflight.test.mjs`, `governed-openai-assistant.test.mjs`, `configured-assistant-rulebook.test.mjs`, and `governed-provider-execution.test.mjs` passed locally (28/28). The response and streaming wrappers deny before count/reserve/dispatch in each root, draft, verifier and repair role. Existing integration tests were updated only with explicitly synthetic preflight fixtures; their database-dependent runs were not claimed here.

Next in this same issue: reconcile FinOps #550's active branch and the canonical grant source; implement and test shared organization grant reservation with project scope, expiry, concurrent attempts, cash authority and receipt settlement. Audit direct/streaming adapters and multi-role execution before claiming comprehensive coverage. Keep the PR draft until the availability impact is resolved. No inference or paid provider call occurred.

Sources: [GOV-DEV-016 #578](https://github.com/jlhogarth/CoMind/issues/578), [NCAP-001 Page](https://chatgpt.com/space/page_6b08564e850881918c2fae4395312868), [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [API benefit terms](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions).
