# AED-CRP: governed conversation return, Test implementation

Date: November 22, 2026. Development owner: issue [#491](https://github.com/jlhogarth/CoMind/issues/491), branch `cbe-004-self-hosted-runner-dispatch`. Consumer ChatGPT live acceptance remains [#489](https://github.com/jlhogarth/CoMind/issues/489). The existing mobile wake and AED monitor PRs remain separate.

## Architecture decision

Use the official OpenAI Conversations item API for an **API-managed** conversation, with a private PostgreSQL return outbox and an authenticated CoMind fallback. Creating a conversation item does not itself invoke a model. An item ID and independent retrieval of the exact content establish API conversation receipt. This does not address an existing consumer ChatGPT conversation or wake a dormant ChatGPT Work session.

The existing CBE browser actuator remains the experimental consumer return adapter. It requires exact registered identity, external authenticated profile, verified TLS, fresh Foundry lease, CLEAR, and observed response start. This CRP branch does not replace that lane or promote its unverified live outcome.

Official API references: [Conversations API](https://platform.openai.com/docs/guides/conversation-state), [create conversation items](https://platform.openai.com/docs/api-reference/conversations/createItem), [list conversation items](https://platform.openai.com/docs/api-reference/conversations/listItems), [retrieve conversation item](https://platform.openai.com/docs/api-reference/conversations/retrieveItem). API-managed `conv_` identifiers and consumer ChatGPT UUIDs are different surfaces. No supported API mapping between them was established.

## Contract and security

`server/src/return-protocol/core.ts` defines schema `1.0`: return and execution IDs, registered origin and owner binding, work key, artifact references and SHA-256 digests, exact destination, authorization reference, Foundry lease reference, result, logical key, and expiry. The private envelope contains the lease capability and result text. Never log it or expose it through a browser token. API origins must come from the provider's conversation creation response. Consumer origins must come from the existing exact CBE binding plus independently authenticated ownership. A URL alone proves no authorization.

`db/migrations/20261122_001_aed_crp_outbox.sql` creates private origin, return, and append-only event tables with RLS and no public, anon, or authenticated grants. Deployment requires an existing approved privileged server database principal with scoped grants. The migration has **not** been applied to the shared Supabase project. Its main branch is labeled Production, and no separate development branch was found. The SQL verification script has not run against PostgreSQL.

The store registers immutable origins, atomically stages by a stable logical key, and fences a dispatch claim with a token and expiry. A stale dispatch is treated as uncertain and must be independently reconciled before any further write. Provider readback failure and ambiguous send remain `DELIVERY_UNCERTAIN`. An absent receipt after an ambiguous send does not authorize another submission. The provider list is bounded to 500 items; an incomplete list fails closed. A five-claim ceiling prevents unbounded activity, though an automated retry schedule and dead-letter operator action are still required.

The Foundry authority wrapper reuses the canonical `createFoundryBrowserLeaseVerifier`. CLEAR is an injected existing authorization resolver with no permissive default. No live resolver has been bound in this branch. The HTTP fallback uses the existing private principal format, binds principal ID to the origin owner, checks the result digest, and accepts an explicit recipient receipt. This is an authenticated CoMind retrieval and acknowledgment, not consumer ChatGPT delivery.

## API contract

The fallback service factory exposes `GET /v1/aed/returns/:id` and `POST /v1/aed/returns/:id/receipt` (body `{ "resultDigest": "<SHA-256 of result>" }`). Bearer principal must be active, unexpired, and scoped to COMIND. A successful GET returns `returnId`, `originId`, `state`, `resultText`, `resultDigest`, and `resultArtifactRef`. A successful receipt returns `returnId`, `state: ACKNOWLEDGED`, and `receiptDigest`. Missing or wrong-owner results return 404; missing authentication returns 401. The service factory is not mounted on a deployed public route. Deploy behind verified TLS with the existing authenticated Test operator service and its private audit configuration before live use.

The OpenAI adapter posts one item to the exact registered API conversation, then retrieves the item independently and checks complete text, item ID, role, status, and digest. It does not call Responses or any model. Provider-side idempotency has not been proven; ambiguous writes remain uncertain unless readback finds the exact marked result.

## Recovery and operator procedure

1. Inspect the private return row and append-only event history using the approved Test operator principal. Check origin ID, owner binding, destination, lease epoch, CLEAR reference, state, and result digest. Do not expose result text or lease token in general logs.
2. For `DELIVERY_UNCERTAIN`, read the entire authorized destination item history and look for the exact Return-ID plus digest. If found, record the verified provider item ID. If readback fails or is incomplete, keep the state uncertain. If absent after an ambiguous send, do not blindly resend.
3. Revalidate the fresh Foundry lease and CLEAR before every dispatch. A revoked owner or changed binding is rejected.
4. For fallback, authenticate as the bound owner, GET the return, locally compare SHA-256, then POST the receipt. A receipt proves that the authenticated CoMind client acknowledged the result. It does not prove ChatGPT read it.
5. After process interruption, reclaim only an expired dispatch claim. The stale claim enters uncertain reconciliation. If all five claims have been consumed, perform governed operator triage; the current implementation does not automate dead-letter recovery.

## Cost

The local tests used no OpenAI API calls, model tokens, or new paid service. The API item transport is designed for zero model inference. Provider request or storage charges and actual live usage remain unknown until official billing evidence and a scoped Test run are available. PostgreSQL storage and hosting reuse existing resources if deployed. No precise per-return dollar estimate is claimed. Any optional Responses continuation needs separate inference cost approval.

## Acceptance evidence, November 22, 2026 UTC

Environment: isolated local checkout, Node 24.22.3, OpenAI SDK 7.28.0, TypeScript build. `npm run build` passed. `node --test` over AED-CRP plus existing CBE tests passed 32 of 32; six CRP tests passed. Tests use an in-memory provider and store unless noted. They do not establish live provider, PostgreSQL, or hosted delivery.

| ID | Outcome | Evidence and limit |
| --- | --- | --- |
| CRP-001 | Local pass | Envelope and staged logical record; PostgreSQL persistence untested. |
| CRP-002 | Local pass | Exact origin and owner checks, wrong-owner rejection. |
| CRP-003 | Local pass | Adapter makes item create/list/retrieve calls, no Responses call; live API untested. |
| CRP-004 | Local pass | Independent item retrieval and exact digest in fake provider. |
| CRP-005 | Local pass | Stable logical key and readback prevent duplicate logical send. |
| CRP-006 | Local pass | Write followed by simulated network loss, then readback without resend. |
| CRP-007 | Local pass | Second worker reconciles uncertain send; real process/DB restart untested. |
| CRP-008 | Blocked | No live expired consumer session proof. |
| CRP-009 | Local pass | Wrong owner and stale lease rejected before send. |
| CRP-010 | Local pass | Two origins dispatch concurrently to distinct provider conversations. |
| CRP-011 | Local pass | Readback outage leaves uncertain and does not send. |
| CRP-012 | Blocked | Five-claim ceiling exists; dead-letter operator flow incomplete. |
| CRP-013 | Local pass | SHA-256 checked at envelope validation and fallback read. |
| CRP-014 | Local pass | Revoked origin and CLEAR denial reject dispatch. |
| CRP-015 | Not run | Model continuation would incur inference; no approval for billable test. |
| CRP-016 | Not supported by documented API | Consumer ChatGPT UUID cannot be addressed through Conversations item API; CBE live experiment remains #489. |
| CRP-017 | Local pass | Authenticated HTTP fallback read and digest-bound acknowledgment via Fastify injection; hosted Test untested. |
| CRP-018 | Blocked | Autonomous consumer continuation and independently hosted AED runtime not proven. |

## Acceptance level and next action

The implementation proves local contract behavior only. It does **not** meet live Level 1 durability until a PostgreSQL Test migration, process restart, and independent readback pass. Level 2 needs authenticated Test principal and canonical authority wiring. Level 3 API-managed conversation needs a permitted live item creation/readback; consumer ChatGPT is separate. Level 4 needs independently observed continuation.

Next: run the migration and verification in an isolated PostgreSQL 17 Test instance; bind the existing CLEAR resolver and server principal; run two real origins and worker restart; record JSONL plus private event readback; then assess a bounded OpenAI API call's published request/storage cost before executing it. Avoid the shared Supabase main/Production branch until Test scope is established. No live API token, password, or lease reference belongs in GitHub evidence.
