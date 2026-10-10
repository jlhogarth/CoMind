# GOV-003 Read-Only System and Provider Evidence

Date: 2026-10-10  
Status: Controlled evidence snapshot for GOV-003. Read-only observations only.

## Purpose

Ground the initial AIMS system/supplier inventory in current observable facts without converting repository design, isolated tests, or external-provider smoke verification into production-deployment claims.

## Live Supabase observation

Project: CoMind (`sbgfuanxiqepcoboxzcl`)  
Project status observed through the connected Supabase control plane: `ACTIVE_HEALTHY`  
Region: `us-east-1`  
PostgreSQL: 17.11

A read-only catalog query on 2026-10-10 observed:

- `comind` base tables: **79**;
- installed relevant extensions: `pg_trgm`, `pgcrypto`, `uuid-ossp`, `vector`;
- `comind.cm_agent` row count: **0**;
- enabled `cm_module_registry` entries:
  - `Causal-Probabilistic Scaffold`;
  - `Future Continuity`;
  - `Legacy Beacon`;
  - `SET Tier`;
  - `SOAP`;
- live migration history remains exactly:
  - `20261005213616` — `comind_base_v2_initial_build`;
  - `20261006051527` — `comind_pm_ledger_maintenance_package_v0_1`;
  - `20261006051627` — `comind_pm_ledger_hardening_v0_1_1`.

No DDL, DML, migration, function execution with side effects, Edge Function deployment, provider call, secret read, or production configuration change was performed.

This refreshed observation is consistent with `LIVE-READ-ONLY-EVIDENCE-2026-10-10.md`: later repository Foundry/security/runtime-budget migrations are not represented in live migration history and must not be described as deployed merely because their repository/isolated tests are green.

## OpenAI external-provider verification evidence

GitHub Issue #26 contains durable evidence of a successful explicitly triggered **Guarded OpenAI Live Smoke** run against an isolated local PostgreSQL `comind_runtime` environment on authoritative main `a6ff54dd91f1e44d44e29a03c6f1d51cd04ddd56`.

Recorded evidence from that issue:

- workflow run `37679264806`, manual `workflow_dispatch`, conclusion `success`;
- model `gpt-6-luna`;
- provider duration 3248 ms;
- 24 input tokens, 20 output tokens, 44 total;
- estimated cost USD 0.0000124 under the then-current rate card;
- exactly one assistant response persisted and verified on conversation reload;
- database target was isolated `comind_runtime`, not live Supabase;
- no credential value was exposed.

GOV-003 classifies this as **real external-provider verification in an isolated environment**. It does **not** establish that OpenAI-backed assistant traffic or the later governed-provider wrapper is deployed in a production CoMind environment.

## Repository/isolated component evidence used by GOV-003

### Base conversation and assistant runtime

Repository evidence shows:

- a Fastify/Node 24 server using PostgreSQL through `DATABASE_URL`;
- an assistant provider configuration that is disabled by default and may be configured for OpenAI;
- isolated PostgreSQL conversation lifecycle verification;
- real HTTP development-runtime verification;
- browser creation/reload persistence verification;
- deterministic provider-disabled and injected-provider test coverage;
- a successful explicit live OpenAI provider smoke in isolated `comind_runtime` as described above.

Evidence references include:

- `server/package.json`;
- `server/src/env.ts`;
- `server/src/assistant-provider.ts`;
- `docs/provenance/2026-10-06-openai-provider-integration.md`;
- `docs/provenance/2026-10-06-chat-runtime-verification.md`;
- `docs/provenance/2026-10-08-conversation-fast-path.md`.

### Governed provider execution

`docs/provenance/2026-10-08-governed-provider-execution-wrapper.md` records deterministic network-free and isolated PostgreSQL verification of the governed provider execution path, including explicit attempt identity, token preflight, maximum-exposure quotation, durable reservation, replay prevention, role-specific telemetry settlement, and fail-closed behavior.

That provenance explicitly states that the existing ordinary configured OpenAI path was not silently switched to the governed execution path. GOV-003 therefore records governed-provider execution as **isolated verified / production deployment not established**.

### Foundry substrate and runtime orchestration

`docs/provenance/2026-10-08-foundry-agent-substrate.md` and `docs/provenance/2026-10-08-foundry-runtime-orchestration.md` establish repository and isolated-database/runtime evidence for identity/profile, capability/grant, authorization, execution context, recovery, deliberation, adapter provenance, and a deterministic provider-independent broker.

The runtime provenance explicitly limits the accepted broker to isolated environment and C0-C2, with C3/C4 failing closed and no production external adapters activated.

Live Supabase lacks the later Foundry tables and has zero `cm_agent` rows, so GOV-003 records the Foundry runtime as **isolated verified / verified not deployed live**.

### Foundry work-lease kernel

`docs/provenance/2026-10-09-foundry-work-lease-kernel.md` records isolated PostgreSQL verification of bounded lease claims, fencing epochs, renewal, expiry/reclaim, stale-owner rejection, exhaustion, and concurrent claim behavior. It explicitly states that no worker, polling loop, adapter dispatch, live database mutation, paid provider request, or production deployment was introduced.

GOV-003 records the work-lease kernel as **isolated verified / verified not deployed live**.

### Runtime budget authority / FinOps

Repository migrations and provenance establish current-runtime budget binding/reservation/settlement controls in isolated PostgreSQL. The live Supabase observation shows `cm_budget_authority_binding` is not present there and the corresponding later migration series is absent from live migration history.

GOV-003 records this control subsystem as **isolated verified / verified not deployed live**.

## Evidence boundary

- Live existence does not equal secure operation.
- Repository implementation does not equal deployment.
- Isolated verification does not equal production operating effectiveness.
- A real provider smoke against isolated infrastructure does not equal production provider activation.
- Enabled rows in `cm_module_registry` do not mean Virtual Employees or autonomous agents are active.
- `cm_agent` contained zero rows at observation time.

The GOV-003 inventory must preserve these distinctions row by row.
