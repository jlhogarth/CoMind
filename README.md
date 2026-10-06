# CoMind

CoMind is a memory-augmented AI platform for persistent cognition, governed reasoning, conversation history, provenance, and human-centered digital twin development.

This repository contains the first recoverable CoMind backend application build, the PostgreSQL schema source, GitHub Actions checks, implementation documentation, and the first minimal browser chat surface.

## Quick start in GitHub Codespaces

1. Select **Code**, then create a Codespace from the branch you intend to test.
2. The development container provisions:
   - Node.js 24.
   - PostgreSQL 17 with pgvector in an isolated `comind_runtime` database.
   - PostgreSQL client tools.
   - Server dependencies through `npm ci`.
   - Automatic devcontainer configuration verification.
   - Automatic isolated database bootstrap through `scripts/bootstrap_dev_runtime.sh`.
3. If you need to reinitialize the isolated development database after resetting it, run:

   ```bash
   bash scripts/bootstrap_dev_runtime.sh
   ```

   The bootstrap script rejects remote database hosts and refuses any database name other than `comind_runtime`.
4. Start CoMind:

   ```bash
   cd server
   npm run dev
   ```

5. Open forwarded port 3000 and visit `/chat`.

The Codespaces runtime does not require a Supabase connection and must not be used to mutate live Supabase.

## Local server environment

When running the server directly outside the Codespaces compose runtime, `dotenv` reads `server/.env` because the server process is launched from the `server` directory.

```bash
cp server/.env.example server/.env
cd server
npm ci
npm run dev
```

Set `DATABASE_URL` in `server/.env` to the PostgreSQL database you explicitly intend to use. Production database changes still require Joseph Hogarth's explicit approval.

## Assistant provider configuration

Assistant generation is disabled by default. In that state, `/chat` continues to create conversations and persist user messages without inserting synthetic assistant text.

The first production provider adapter is OpenAI through the Responses API. CoMind remains the authoritative conversation store: the adapter sends the chronological history loaded from PostgreSQL on each request and explicitly disables provider-side response storage with `store: false`.

To enable OpenAI in a development environment, set these values in `server/.env` or through the runtime environment:

```text
ASSISTANT_PROVIDER=openai
OPENAI_API_KEY=<secret supplied through the runtime environment>
OPENAI_MODEL=gpt-6-luna
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=1024
ASSISTANT_MAX_HISTORY_MESSAGES=40
OPENAI_TIMEOUT_MS=30000
OPENAI_MAX_RETRIES=2
```

Do not commit an OpenAI API key. `OPENAI_API_KEY` is required only when `ASSISTANT_PROVIDER=openai`. The model, reasoning effort, output-token bound, retained-history message count, request timeout, and retry count are validated configuration rather than conversation-schema decisions.

A guarded live-provider smoke verification is available for explicit development use after the isolated database is running and `OPENAI_API_KEY` is present in the environment:

```bash
bash scripts/verify_openai_live.sh
```

That script refuses remote database hosts and refuses database names other than `comind_runtime`. It is not part of ordinary CI.

## Application endpoints

The API runs on port 3000. Current endpoints include:

- `/chat`
- `/health`
- `/api/db/health`
- `/api/conversations`
- `/api/assistant/status`
- `/api/conversations/:id/assistant-response`
- `/api/ingest/chatgpt`
- `/api/messages/search`
- `/api/analytics/summary`
- `/api/research`
- `/api/checklist`
- `/admin`

## Supabase and PostgreSQL configuration

- Store the full Postgres connection string in the GitHub Actions secret named `DATABASE_URL` where a workflow explicitly requires it.
- Store the non-secret Supabase project reference in the GitHub Actions variable named `SUPABASE_PROJECT_REF` where required.
- Do not commit connection strings, database passwords, service-role keys, OpenAI API keys, or local `.env` files.
- The isolated Codespaces runtime uses only the compose-managed `comind_runtime` database.
- Production database changes require explicit authorization.

## GitHub Actions

- Continuous Integration builds and tests the server on pushes and pull requests.
- PostgreSQL lifecycle tests run against isolated PostgreSQL 17 services.
- The browser runtime test keeps the assistant provider disabled unless a separate explicit live verification is performed.
- The no-placeholder gate rejects unresolved development markers.
- Repository configuration checks confirm that required settings exist without printing secret values.

## Repository structure

- `db/sql/v2` contains the recovered base schema source.
- `db/migrations` contains later, dated control-plane migrations and verification queries.
- `docs` contains implementation status, provenance, and operational notes.
- `server` contains the TypeScript backend and the minimal `/chat` browser surface.
- `.devcontainer` contains the isolated Codespaces runtime definition.

Production database changes require Joseph Hogarth's explicit approval.
