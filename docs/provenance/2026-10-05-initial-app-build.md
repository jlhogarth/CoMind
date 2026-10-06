# CoMind Initial App Build Provenance

Date: 2026-10-05

## Purpose

This record documents the first recoverable CoMind application build prepared for GitHub after the Supabase test database was created.

## Source state

- Repository target: `jlhogarth/CoMind`
- Repository visibility: public
- Default branch before app build: `main`
- Initial repository contents before app build: README plus GitHub workflow directory.
- Recovered source basis: CoMind backend repository files recovered from prior Drive and Codespaces work.

## Database state

- Database platform: Supabase Postgres
- Supabase project reference: `sbgfuanxiqepcoboxzcl`
- Applied migration version: `20261005213616`
- Applied migration name: `comind_base_v2_initial_build`
- Primary schema: `comind`
- Baseline table count: 79

## GitHub Actions configuration

Required repository secret:

- `DATABASE_URL`

Required repository variable:

- `SUPABASE_PROJECT_REF`

The workflow verifies that required settings exist without printing their values.

## Security posture

- No database password, service role key, full connection string, or local `.env` file is committed.
- The application uses `DATABASE_URL` at runtime.
- Supabase hardening remains a tracked backlog item: row-level security policy design, function `search_path` hardening, and foreign-key index additions.

## Application scope

This build includes:

- Fastify TypeScript backend.
- Conversation and message APIs.
- ChatGPT export ingestion route.
- Message search.
- Summary analytics.
- Research reference management.
- Enterprise checklist management.
- Lightweight admin page.
- Health and database health endpoints.

## Recoverability notes

- This file captures the project state used to create the initial GitHub app-build branch.
- Future ChatGPT export ingestion should preserve source export metadata in message and conversation records.
- Derived analyses should remain separate from raw conversation import records so provenance is not blurred.
