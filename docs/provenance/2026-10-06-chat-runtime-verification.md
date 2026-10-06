# Chat runtime verification evidence

Date: 2026-10-06
GitHub issue: #12
Pull request: #13
Verified branch: `test/chat-runtime-verification`
Verified application/runtime commit: `15799cd3b6c11988c8bf3e637bafe1117df2c275`
CI workflow run: `37436233809`

## Objective

Verify the CoMind `/chat` vertical slice through a real browser-accessible application runtime backed only by an isolated PostgreSQL 17 database with pgvector. No live Supabase database was used or modified.

## Runtime evidence

The `dev-runtime-verification` job used `pgvector/pgvector:0.8.6-pg17-bookworm` with the dedicated database name `comind_runtime`.

The repository bootstrap completed successfully and reported:

```text
comind_runtime|t|t
Isolated CoMind chat development database is initialized.
```

The two boolean values establish PostgreSQL 17-or-newer behavior and the presence of the `vector` extension.

## HTTP to PostgreSQL evidence

The real Fastify process was started on TCP port 3000. The HTTP verification exercised `/chat`, conversation creation, user-message persistence, conversation reload, message search, and analytics.

The workflow reported:

```text
HTTP runtime verification passed for conversation ee7bcdbe-693d-4725-8efa-3fd728902fde.
Direct PostgreSQL verification passed for 37436233809-1791275303.
```

The direct SQL check joined `comind.cm_conversation` and `comind.cm_message` and required exactly one row matching the values created through the application HTTP path.

## Browser evidence

A real headless Chrome browser navigated to `http://127.0.0.1:3000/chat` and performed the following DOM interactions:

1. Entered a new conversation title.
2. Clicked `Create conversation`.
3. Entered a user message.
4. Clicked `Send`.
5. Confirmed the message rendered.
6. Refreshed the browser page.
7. Confirmed the same conversation and user message remained visible after reload.
8. Confirmed the page status contained `PostgreSQL`.

The browser-created values were:

```text
Conversation title: Browser verification 37436233809-1791275306
User message: CoMind browser persistence 37436233809-1791275306
```

The workflow reported:

```text
Browser verification passed at http://127.0.0.1:3000/chat.
Direct PostgreSQL verification passed for browser-created data 37436233809-1791275306.
```

The direct SQL check again required exactly one joined conversation/message row matching the browser-created values.

## Visual evidence

The browser verification screenshot was uploaded by GitHub Actions as artifact `chat-browser-verification`, artifact ID `11398519877`, from workflow run `37436233809`.

Artifact SHA-256 digest:

```text
06055bea3f6bba136439c59012d6e528aa4b6b06586b6c367ebb5e50ae219428
```

Visual inspection confirmed that the screenshot shows:

- The browser-created conversation selected in the conversation list.
- The persisted browser-created user message rendered in the conversation.
- The status text `Conversation loaded from PostgreSQL.`
- The prior HTTP runtime verification conversation also persisted in the conversation list.

## Required gates

For commit `15799cd3b6c11988c8bf3e637bafe1117df2c275`:

- CI run `37436233809`: success.
- Build, server tests, and production dependency audit: success.
- PM Ledger migration verification: success.
- Conversation lifecycle integration: success.
- Isolated development runtime verification: success.
- Real Chrome browser verification and reload persistence: success.
- No Placeholder Policy run `37436233688`: success.
- Repository configuration run `37436233730`: success.

## Safety statement

This verification used an isolated PostgreSQL 17 + pgvector service. The runtime bootstrap rejects remote database hosts and requires the dedicated `comind_runtime` database name. No live Supabase mutation, Neon usage, production deployment, or assistant/model provider integration was performed.

## Architecture finding

During issue #12, attempting to apply all historical numbered migrations after the recovered base schema exposed an existing schema-contract mismatch in `20260910_001_comind_finops_resource_governor.sql`, which references `projects` and `agents` rather than the recovered CoMind schema contract. Issue #12 did not alter that legacy migration. The chat runtime correctly uses the same recovered `MASTER.sql` schema path already proven by conversation lifecycle integration, while PM Ledger remains verified through its dedicated compatibility bootstrap.
