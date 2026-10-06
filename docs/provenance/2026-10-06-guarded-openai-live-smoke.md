# Guarded OpenAI live provider verification

Date: 2026-10-06
Issue: #26
Branch: `test/guarded-openai-live-provider`
Base main: `5f00ae22ecae62dc95df3272c5ea5ba4e68c4e98`

## Purpose

Provide a repeatable, explicit, paid live-provider verification path that exercises the production OpenAI adapter while keeping all database writes inside isolated PostgreSQL database `comind_runtime`.

## Existing guardrails reviewed

`scripts/verify_openai_live.sh` requires both `DATABASE_URL` and `OPENAI_API_KEY`. Before bootstrapping or starting the server, it parses `DATABASE_URL` and refuses any non-PostgreSQL URL, any host other than `db`, `localhost`, or `127.0.0.1`, and any database name other than `/comind_runtime`.

The script enables the OpenAI assistant provider only for the verification process, builds and starts the server, creates a verification conversation, persists a user message, requests one assistant response, reloads the conversation, and directly checks PostgreSQL for exactly one persisted assistant row containing non-empty OpenAI response provenance.

## Manual GitHub Actions path

`.github/workflows/openai-live-smoke.yml` is intentionally `workflow_dispatch` only. It does not run on push or pull request events, so a paid OpenAI request cannot be triggered by normal CI.

The workflow provisions a disposable PostgreSQL 17 + pgvector service whose database is named `comind_runtime`, installs the repository dependencies, verifies that the repository Actions secret `OPENAI_API_KEY` is present without printing its value, and invokes the existing guarded verification script.

The workflow has read-only repository contents permission, a ten-minute job timeout, and a single-run concurrency group.

## Safety boundaries

- No live Supabase database URL is supplied to the workflow.
- No Supabase project is mutated.
- Neon is not used.
- `OPENAI_API_KEY` is consumed only from GitHub Actions secrets and is never written to repository files or printed by the workflow.
- The live smoke workflow must be explicitly started by a human or authorized workflow-dispatch caller.
- Ordinary CI remains provider-disabled and incurs no OpenAI provider charge.

## Verification evidence policy

Repository changes can be merged only after ordinary build, test, integration, devcontainer, dependency, repository-configuration, and no-placeholder gates are green. The live-provider success claim requires a separate successful run of the manual `Guarded OpenAI Live Smoke` workflow. The successful workflow run URL and outcome are to be recorded on Issue #26 and its pull request after execution.
