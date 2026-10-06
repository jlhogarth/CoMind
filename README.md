# CoMind

CoMind is a memory-augmented AI platform for persistent cognition, governed reasoning, conversation history, provenance, and human-centered digital twin development.

This repository contains the first recoverable CoMind backend application build, the PostgreSQL schema source, GitHub Actions checks, and implementation documentation.

## Quick start in GitHub Codespaces

1. Select **Code**, then **Create codespace on main**.
2. After the container builds, run:

   ```bash
   cp .env.example .env
   # Add the Supabase/Postgres connection string to DATABASE_URL in .env.
   cd server
   npm ci
   npm run dev
   ```

3. The API runs on port 3000. Endpoints include:

   - `/health`
   - `/api/db/health`
   - `/api/conversations`
   - `/api/ingest/chatgpt`
   - `/api/messages/search`
   - `/api/analytics/summary`
   - `/api/research`
   - `/api/checklist`
   - `/admin`

## Connect to Supabase/Postgres

- Store the full Postgres connection string in the GitHub Actions secret named `DATABASE_URL`.
- Store the non-secret Supabase project reference in the GitHub Actions variable named `SUPABASE_PROJECT_REF`.
- Do not commit connection strings, database passwords, service-role keys, or local `.env` files.
- The current Supabase test project reference is documented in the provenance notes, not hard-coded into application source.

## Run migrations from Codespaces

```bash
bash scripts/migrate.sh
```

## GitHub Actions

- Continuous Integration (CI) builds the server on pushes and pull requests.
- The no-placeholder gate rejects unresolved development markers.
- Repository configuration checks confirm that required Supabase Actions settings exist without printing their values.

## Repository structure

- `db/sql/v2` contains the recovered base schema source.
- `db/migrations` contains later, dated control-plane migrations and their verification queries.
- `docs` contains implementation status, provenance, and operational notes.
- `server` contains the TypeScript backend.

Production database changes require Joseph Hogarth's explicit approval. The frontend remains a separate application.
