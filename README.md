# CoMind

CoMind is a memory-augmented AI platform for persistent cognition, governed reasoning, conversation history, provenance, and human-centered digital twin development.

This repository contains the first recoverable CoMind backend application build, the PostgreSQL schema source, GitHub Actions checks, implementation documentation, and the first minimal browser chat surface.

## Quick start in GitHub Codespaces

1. Select **Code**, then create a Codespace from the branch you intend to test.
2. The development container provisions:
   - Node.js 20.
   - PostgreSQL 17 with pgvector in an isolated `comind_runtime` database.
   - PostgreSQL client tools.
   - Server dependencies through `npm ci`.
3. Initialize the isolated development database:

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

## Application endpoints

The API runs on port 3000. Current endpoints include:

- `/chat`
- `/health`
- `/api/db/health`
- `/api/conversations`
- `/api/ingest/chatgpt`
- `/api/messages/search`
- `/api/analytics/summary`
- `/api/research`
- `/api/checklist`
- `/admin`

## Supabase and PostgreSQL configuration

- Store the full Postgres connection string in the GitHub Actions secret named `DATABASE_URL` where a workflow explicitly requires it.
- Store the non-secret Supabase project reference in the GitHub Actions variable named `SUPABASE_PROJECT_REF` where required.
- Do not commit connection strings, database passwords, service-role keys, or local `.env` files.
- The isolated Codespaces runtime uses only the compose-managed `comind_runtime` database.
- Production database changes require explicit authorization.

## GitHub Actions

- Continuous Integration builds and tests the server on pushes and pull requests.
- PostgreSQL lifecycle tests run against isolated PostgreSQL 17 services.
- The no-placeholder gate rejects unresolved development markers.
- Repository configuration checks confirm that required settings exist without printing secret values.

## Repository structure

- `db/sql/v2` contains the recovered base schema source.
- `db/migrations` contains later, dated control-plane migrations and verification queries.
- `docs` contains implementation status, provenance, and operational notes.
- `server` contains the TypeScript backend and the minimal `/chat` browser surface.
- `.devcontainer` contains the isolated Codespaces runtime definition.

Production database changes require Joseph Hogarth's explicit approval.
