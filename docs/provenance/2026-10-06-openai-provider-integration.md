# OpenAI provider integration evidence

Date: 2026-10-06
GitHub issue: #14
Pull request: #16
Branch: `feature/openai-assistant-provider`
Verified implementation commit: `9a810d3836ddc17a7f7d77a8db59f6d5efac5f31`
CI workflow run: `37439540386`

## Objective

Integrate the first production assistant provider through CoMind's existing `AssistantProvider` boundary while keeping PostgreSQL as the authoritative conversation store.

## Provider architecture

The first adapter uses the official OpenAI Node SDK and the Responses API.

The adapter:

- Receives CoMind conversation history through `AssistantProvider`.
- Sends chronological persisted history supplied by CoMind.
- Sets `store: false` on every provider request.
- Does not use provider-owned conversation objects or `previous_response_id`.
- Rejects tool-role history because provider tools are disabled for this issue.
- Returns assistant text plus non-secret provider/model/response/usage metadata.
- Contains no database write logic.

The application route loads persisted history, calls the injected provider, and writes an assistant row only after generation succeeds.

## Persistence and failure behavior

Deterministic route tests prove:

- Provider-disabled status is available without querying PostgreSQL.
- Generation returns HTTP 503 when no provider is configured.
- Persisted history is passed to the provider in chronological order.
- Successful assistant output is inserted into `comind.cm_message` with role `assistant`.
- Provider/model/response identifier and token usage metadata are persisted without secrets.
- Provider failure returns a generic HTTP 502 and does not insert an assistant message.
- Missing conversations return HTTP 404 before provider invocation.

The `/chat` browser path preserves the durable user-message write first. Provider generation is attempted only afterward when the provider is enabled. Provider failure therefore cannot erase the persisted user message.

## Isolated PostgreSQL evidence

The conversation lifecycle integration job passed on PostgreSQL 17 with pgvector.

The new assistant lifecycle test creates a real conversation, persists a user message, invokes an injected deterministic provider through the production route, persists the assistant response, reloads both rows in order, verifies search and analytics behavior, checks provider provenance directly in PostgreSQL, and deletes its own test conversation afterward.

The deterministic provider used by this test exists only through dependency injection in test code. No fake production provider was added.

## Runtime and browser regression evidence

The existing isolated `comind_runtime` verification passed under Node 24.

The workflow proved:

- Isolated PostgreSQL 17 + pgvector bootstrap: success.
- Real Fastify HTTP chat verification: success.
- Real Chrome conversation creation, user-message submission, page reload, and PostgreSQL-backed persistence: success.
- Provider-disabled browser behavior remains functional and truthful.

Browser screenshot artifact:

```text
Name: chat-browser-verification
Artifact ID: 11401090324
SHA-256: c56550bca46c4b53a3a913abd70c28fbfa67345b5f55042e626db998d8c2ec1f
```

## Runtime and dependency evidence

CoMind server, Codespaces, and Node-bearing CI jobs now use Node 24.

`server/package-lock.json` was generated canonically by npm on a Node 24 GitHub Actions runner after adding the pinned OpenAI SDK. The temporary lockfile-generation workflow was removed before final verification.

The verified lock records:

- `openai`: `7.28.0`
- `@types/node`: `^24.0.0`
- Node engine: `>=24 <25`

## Required gates

For implementation commit `9a810d3836ddc17a7f7d77a8db59f6d5efac5f31`:

- CI run `37439540386`: success.
- Node 24 dependency installation: success.
- TypeScript build: success.
- Unit, route, environment, and provider mapping tests: success.
- Production dependency audit: success.
- PM Ledger migration verification: success.
- Isolated PostgreSQL conversation and assistant lifecycle integration: success.
- Real HTTP development-runtime verification: success.
- Real Chrome reload-persistence verification: success.
- No Placeholder Policy run `37439540517`: success.
- Repository configuration run `37439540502`: success.

## Live OpenAI verification blocker

The repository now includes `scripts/verify_openai_live.sh`, a guarded opt-in real-provider smoke path. It requires an explicitly supplied `OPENAI_API_KEY`, restricts the database target to the isolated `comind_runtime` database on a local runtime host, bounds the output request, verifies a real assistant response over HTTP, reloads it from CoMind, and confirms the provider metadata directly in PostgreSQL.

No authorized OpenAI API key was supplied to this development conversation. Therefore the live paid OpenAI call was not executed and no claim of live-provider success is made.

Resolver: Joseph Hogarth can explicitly supply or authorize a development OpenAI API credential in a protected runtime environment when live-provider verification is desired. The credential must not be committed to the repository or exposed in logs.

## Safety statement

No live Supabase mutation was performed. Neon and Linear were not used. No production API key was committed. No provider-managed conversation persistence, tools, web search, retrieval-augmented generation, streaming, multimodal input, or agent orchestration was introduced in this issue.
