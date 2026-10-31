# CFR-001C Provider-Stream Capture Gateway

Date: 2026-10-25  
Parent: CFR-001 / Issue #176  
Work item: CFR-001C / Issue #178  
Pull request: #179  
Environment: Test only  
Supabase project: `sbgfuanxiqepcoboxzcl`  
Production changed: No

## Purpose

CFR-001C wires the verified CFR-001 conversational continuity substrate into the real CoMind assistant path. The required property is that user input is durably observed before inference and assistant output is durably observed while the provider stream is in progress, so a provider or client interruption cannot silently erase text CoMind has already received.

## Implementation summary

The branch introduces or hardens the following behavior:

- isolated PostgreSQL bootstrap includes the four-state conversational continuity model
- message append atomically persists the canonical message and CFR observation
- assistant generation claim idempotently backfills the latest user observation
- assistant providers may expose an optional typed stream observer
- direct/legacy providers remain non-streaming unless explicitly opted in
- production OpenAI provider uses Responses streaming when the observer is present
- only `response.output_text.delta` is treated as conversational stream evidence
- reasoning events are not captured as conversation content
- provider response identifiers and sequence numbers are preserved when available
- quality stages are tagged as `direct`, `draft`, or `repair`
- verifier output remains internal and is not forwarded to the conversation observer
- each observed assistant delta is persisted before provider iteration continues
- zero-delta provider failure terminalizes as `failed`
- failure after any observed assistant delta terminalizes as `interrupted`
- canonical assistant completion, generation completion, and terminal CFR evidence are persisted as one database statement
- claim-token stale-writer protection remains intact

## Quality-gate boundary

Capture and presentation are distinct concerns.

CFR may observe draft and repair output because those provider deltas are source evidence. Verifier JSON remains internal. A captured provider delta is not automatically a canonical user-visible assistant message. Only the approved final content is persisted as the canonical assistant turn.

## OpenAI streaming contract

Current OpenAI Responses streaming behavior was checked before implementation. The adapter consumes output-text delta events, ignores reasoning-text events, requires a real completed terminal event for successful completion, and preserves already-observed deltas when a stream terminates incompletely.

Research session: `CFR-001-OPENAI-STREAMING-2026-10-25`  
RunBook research event: `287f4f4a-062e-480c-9022-d7574ff51cf7`

## Compatibility and CI corrections

The implementation was exercised through the repository workflow matrix and several defects or stale assumptions were surfaced and corrected.

### OpenAI SDK overload resolution

The streaming `responses.create()` overload initially resolved to the non-streaming response type. The durable fix places the more specific `stream: true` overload before the general request overload.

### Test-contract drift

Existing route fixtures were updated to model the new CFR capture result and parameterized terminal lifecycle. PostgreSQL `BIGINT` sequence values are normalized before JavaScript numeric assertions. Recovery tests now explicitly validate the CFR fast-path and conversational-continuity metadata.

### Historical LF-3 fixture isolation

CFR added four new `comind` tables, increasing the current isolated schema beyond the historical LF-3 pre-007 security fixture. The LF-3 test intentionally validates the exact historical 94-table accepted LF-2 shape, so changing its expected count would have corrupted the historical contract.

The disposable LF-3 fixture now explicitly removes the later CFR-only tables before evaluating migration 007:

- `cm_conversation_promotion_evaluation`
- `cm_conversation_recovery_checkpoint`
- `cm_conversation_capture_event`
- `cm_conversation_capture_cursor`

The original 94-table historical invariant remains unchanged.

## Isolated PostgreSQL acceptance

The conversation-lifecycle integration test exercises real PostgreSQL with deterministic synthetic providers.

### Completed stream

Verified:

- user turn persisted
- generation claimed once
- two assistant deltas persisted in order
- canonical assistant message persisted once
- generation terminalized `completed`
- completion evidence written

### Interrupted stream

Verified:

- user turn persisted
- generation claimed once
- two assistant deltas persisted in order
- synthetic disconnect occurs before canonical completion
- generation terminalized `interrupted`
- zero canonical assistant messages persisted
- partial assistant content remains reconstructable from capture events

## Live Test service-role acceptance

A synthetic, non-cost-bearing proof was executed against the deployed Supabase Test project under the actual PostgreSQL `service_role`. No provider or model was called.

Before mutation, the Test boundary was verified to grant `service_role` the exact required capabilities: private schema usage, conversation/message access, assistant-generation lifecycle access, capture-event/cursor access, and capture-function execution.

### Interrupted proof

Conversation: `9881599b-6bef-4ee9-baef-b7b8073532eb`  
User message: `65473ff6-37fd-483b-8e75-697c40c6401d`  
Generation: `0f87b34e-69ff-43ee-af1f-ec9569a38d87`  
External reference: `cfr-001c-service-proof-interrupted-20261025`

Verified result:

- terminal status: `interrupted`
- canonical user messages: `1`
- canonical assistant messages: `0`
- capture events: `5`
- capture sequence: contiguous `1..5`
- event path: `user_message_observed -> assistant_generation_started -> assistant_delta -> assistant_delta -> assistant_generation_interrupted`
- reconstructed partial: `This partial response survived the synthetic interruption.`
- acceptance: `PASS`

### Completed proof

Conversation: `1f0a2cd2-dc29-420f-a3f4-45a5b15200a0`  
User message: `194ceb62-cbc1-465f-8dfa-a742e77f850d`  
Generation: `2f66e50b-9c0d-409b-9ad1-2c27d47724ed`  
Assistant message: `d6b0e55b-b8c0-44a4-9d90-6a17df0ec84f`  
External reference: `cfr-001c-service-proof-completed-20261025`

Verified result:

- terminal status: `completed`
- canonical user messages: `1`
- canonical assistant messages: `1`
- capture events: `5`
- capture sequence: contiguous `1..5`
- event path: `user_message_observed -> assistant_generation_started -> assistant_delta -> assistant_delta -> assistant_generation_completed`
- reconstructed stream: `This completed response was captured before canonical completion.`
- canonical assistant content exactly equals reconstructed stream
- acceptance: `PASS`

Reusable verification artifact:

`db/verification/cfr_001c_service_role_live_test.sql`

## Verification-query correction

The first post-proof summary query joined capture events directly to canonical messages, creating a row multiplication in the completed case and therefore inflated counts and duplicated the displayed event path. The underlying durable writes were not duplicated.

The verification query was corrected to aggregate events and messages independently before joining summaries. The corrected query returned `acceptance_pass = true` for both proof conversations. This correction is retained here as evidence because verification logic is itself part of the trustworthy evidence path.

## Development visibility rule

During this lane, the user established a standing CoMind development rule requiring active coding work to remain visibly inspectable through direct links whenever available.

Canonical rule:

- `comind.cm_policy_rule.rule_id`: `3439abf0-e44b-41db-83d5-cf06ecd9e9d2`
- name: `development_visibility_links`

The rule requires progress visibility and direct links to relevant pull requests, issues, workflow runs, checks, deployments, logs, and evidence when available.

## Code-gate evidence

Pre-evidence code head: `c1f896887222dd1a91de17821b7cfbf6eb949f01`

On that exact head, all 13 pull-request workflow families completed successfully, including:

- CI
- conversation lifecycle integration
- development runtime verification with HTTP/PostgreSQL and Chrome reload persistence
- devcontainer runtime
- DRB-002 Query Contract
- Runtime Budget Authority Adapter
- Governed Provider Execution
- Foundry Work Lease Kernel
- Foundry Runtime Orchestration
- Foundry Terminal Lifecycle
- Live Foundry Stage 1 Readiness
- Live Foundry LF-2 Readiness
- Live Foundry LF-3 Readiness
- Foundry Test one-shot local handoff
- repository configuration and placeholder-policy gates

The evidence commits intentionally advance the PR head after this code-gate snapshot. The final evidence-complete head must pass the workflow matrix again before merge.

## Architectural conclusions

1. CoMind can preserve assistant text before canonical completion without weakening stale-writer or terminal lifecycle controls.
2. An interrupted provider stream can leave zero canonical assistant messages while still preserving exact partial assistant content as source evidence.
3. Provider-observed output and canonical user-visible output are separate representations.
4. Quality-gate verifier output remains internal and must not be mistaken for conversational source content.
5. The deployed Test `service_role` has sufficient least-privilege access for the server-side continuity path without exposing CFR to public client roles.
6. Historical migration/security fixtures must be isolated from later additive modules rather than silently changing their historical invariants.
7. Verification logic can itself fail. Acceptance evidence should therefore preserve corrections to faulty verification queries rather than hide them.

## Result

`PASS`

CFR-001C has demonstrated the exact application-path behavior required to protect CoMind-controlled conversations against mid-stream loss in both isolated PostgreSQL and the deployed Supabase Test service boundary. Production activation remains out of scope.