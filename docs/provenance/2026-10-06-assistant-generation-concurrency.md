# Assistant generation concurrency verification evidence

Date: 2026-10-06
GitHub issue: #24
Pull request: #25
Authoritative base commit: `7c9822c4bd1682b97fb06482d3b1dff2c94e4905`
Implementation commit: `ff7465f53461b0a262fd920d2351d37fcf48d644`
Initial successful CI run: `37520458240`
No Placeholder Policy run: `37520458164`
Repository Configuration run: `37520458192`

## Objective

Prevent duplicate concurrent assistant generation and replayed provider calls for the same conversation before broader live-provider use.

## Implemented concurrency contract

- Production assistant generation uses a PostgreSQL session advisory lock keyed deterministically by conversation identifier.
- The lock is held on one PostgreSQL connection across history loading, provider execution, and assistant-message persistence.
- Conversation message appends use the same lock so a new turn cannot be written while an assistant response is being generated from prior history.
- An overlapping generation request returns HTTP `409` and does not invoke the provider.
- An overlapping message append returns HTTP `409` and does not write a message.
- If the latest user turn already has a persisted assistant response, a replay returns that existing row with HTTP `200` without invoking the provider or inserting a duplicate.
- A newly generated and persisted assistant response returns HTTP `201`.
- Provider failure continues to return HTTP `502`, preserves the user row, and releases the advisory lock so a later retry can proceed.
- If advisory lock release cannot be established, the database connection is discarded rather than returned to the pool with uncertain lock state.

## Deterministic server validation

CI build job on run `37520458240` used Node.js 24.21.0 and completed:

- TypeScript build: success.
- Server tests: 39 passed, 0 failed.
- New busy-generation route test: success.
- New busy-message-write route test: success.
- New replay-without-provider-call route test: success.
- Production dependency audit: 0 vulnerabilities reported.

## Isolated PostgreSQL concurrency evidence

The `conversation-lifecycle-integration` job used `pgvector/pgvector:0.8.6-pg17-bookworm` with PostgreSQL 17.11 and the isolated `comind_ci` database.

The new concurrency integration test deliberately held the first provider call open and then exercised overlapping requests. The observed sequence was:

1. Initial user message persisted with HTTP `201`.
2. First assistant generation acquired the conversation lock and entered the provider.
3. Overlapping assistant generation returned HTTP `409`.
4. Overlapping user-message append returned HTTP `409`.
5. The first provider call was released and its assistant response persisted with HTTP `201`.
6. A replay returned the same persisted assistant message with HTTP `200`.
7. Provider invocation count remained exactly one.
8. Direct PostgreSQL verification found exactly one user row and one assistant row for the tested turn.
9. A subsequent user message succeeded with HTTP `201` after lock release.

The complete isolated PostgreSQL integration suite reported 13 passed, 0 failed. Existing assistant lifecycle, failure recovery, bounded history, conversation lifecycle, search, analytics, and chat persistence checks remained green.

## Other permanent gates

For implementation commit `ff7465f53461b0a262fd920d2351d37fcf48d644`:

- CI build job: success.
- PM Ledger migration verification: success.
- Conversation lifecycle integration: success, 13 passed and 0 failed.
- Development runtime bootstrap: success.
- Real HTTP chat verification: success.
- Chrome chat and reload persistence verification: success.
- Devcontainer contract validation: success.
- Docker Compose validation: success.
- Devcontainer build, bootstrap, build, and test verification: success.
- No Placeholder Policy run `37520458164`: success.
- Repository Configuration run `37520458192`: success.

## Safety statement

All automated database work used isolated PostgreSQL databases named `comind_ci` or `comind_runtime`. Live Supabase was not read or mutated. Neon was not used. No credentials were added or committed. No paid OpenAI provider request was made as part of this issue.

## Operational boundary

The session advisory lock deliberately occupies one PostgreSQL pool connection for the duration of an assistant provider request. That is acceptable for the current correctness-first runtime and prevents cross-process duplication. If future provider concurrency becomes high enough that connection occupancy is material, a durable generation-reservation state can be evaluated as a separate design milestone without weakening the current one-response-per-turn contract.

## Follow-on

After Issue #24 is merged, the next provider-readiness verification is the existing guarded live OpenAI smoke path against isolated `comind_runtime` using an explicitly supplied development API key. That verification remains separate because it performs a paid provider request.
