# Codespaces devcontainer runtime evidence

Date: 2026-10-06
GitHub issue: #21
Branch: `issue-21-codespaces-devcontainer-runtime`
Base commit: `74752fa2edfbb7da8d67dd8fcad5d8fc80a1dac5`

## Objective

Verify and harden the Codespaces and local developer bootstrap path so a developer can open the repository, enter the devcontainer runtime, and reach the isolated `/chat` path without guessing which database or setup command is authoritative.

## Runtime contract

The devcontainer contract is now checked by `scripts/verify_devcontainer_config.mjs`.

The verifier confirms:

- `.devcontainer/devcontainer.json` targets the `workspace` service, opens `/workspaces/CoMind`, forwards port `3000`, installs server dependencies, verifies the devcontainer configuration, and runs `scripts/bootstrap_dev_runtime.sh`.
- `.devcontainer/compose.yaml` builds from `.devcontainer/Dockerfile`, uses only the compose-managed `db` host for `DATABASE_URL`, exposes `PORT=3000`, waits for PostgreSQL health, and provisions `pgvector/pgvector:0.8.6-pg17-bookworm`.
- `.devcontainer/Dockerfile` uses the Node 24 devcontainer image and installs PostgreSQL client tools.
- `scripts/bootstrap_dev_runtime.sh` keeps the local-only `comind_runtime` guardrails and PostgreSQL 17 + pgvector verification.
- `README.md` documents Node.js 24, PostgreSQL 17 with pgvector, PostgreSQL client tools, forwarded port `3000`, `/chat`, the bootstrap script, and the live-provider smoke boundary.

## Bootstrap path

`scripts/bootstrap_dev_runtime.sh` remains the single bootstrap path for the isolated development database.

Its existing safety checks are preserved:

- `DATABASE_URL` is required.
- Only `postgres` and `postgresql` URLs are accepted.
- Only `db`, `localhost`, or `127.0.0.1` hosts are accepted.
- Only the `/comind_runtime` database path is accepted.
- The script waits for PostgreSQL readiness before loading `db/sql/v2/MASTER.sql`.
- It verifies the database name, PostgreSQL 17 compatibility, and pgvector extension before reporting success.

## CI coverage

CI now runs `node scripts/verify_devcontainer_config.mjs` in both:

- The ordinary build job after `npm ci`.
- The `dev-runtime-verification` job before browser and PostgreSQL runtime checks.

This keeps documentation, `.devcontainer` configuration, and runtime bootstrap assumptions under test without requiring a live Supabase mutation or a paid OpenAI provider call.

## Out of scope

No production Docker deployment path was introduced. No live Supabase mutation was performed. Neon was not used. No credentials were added or committed. Live OpenAI provider verification remains opt-in through `scripts/verify_openai_live.sh` with a runtime-supplied `OPENAI_API_KEY`.
