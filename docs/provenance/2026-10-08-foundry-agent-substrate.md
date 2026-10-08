# Foundry Agent Substrate Provenance

Date: 2026-10-08
Issue: #70
Branch: `issue-70-foundry-agent-substrate`
Base main SHA: `ca21f82fdf00b829ba4d0b63e5d511b448af722d`

## Scope

This milestone adds the first real database substrate for CoMind Foundry Agents and Virtual Employees in repository code only. It does not mutate live Supabase, create live provider calls, execute paid token-count calls, or run an autonomous multi-agent production drill.

The migration creates governed support tables for:

- Durable Foundry agent profiles that bind `cm_agent` records to `cm_actor` identities.
- Provider-independent capability definitions and scoped grants.
- Authorization requests and decisions.
- Execution context provenance that can link project, task, conversation, capability, authorization decision, and `cm_budget_authority_binding`.
- Deliberation sessions, participants, events, and outcomes.
- Recovery checkpoints.
- Adapter operation provenance using request fingerprints rather than raw sensitive payloads.

## Security Posture

The substrate is designed as isolated PostgreSQL hardening before any live Supabase deployment:

- Every new `comind.cm_foundry_%` table enables row-level security.
- `anon` and `authenticated` receive no direct table privileges.
- No broad `TRUE` RLS policies are created.
- No raw prompt, response, credential, secret, API key, token, or duplicate monetary accounting columns are introduced.
- Append-only triggers protect authorization decisions, execution contexts, deliberation events, deliberation outcomes, recovery checkpoints, and adapter operations.
- The only new function fixes `search_path` to avoid mutable search-path exposure.

## Verification

New verifier files:

- `db/migrations/20261008_006_foundry_agent_substrate.sql`
- `db/migrations/verify_20261008_006_foundry_agent_substrate.sql`
- `scripts/test_foundry_agent_substrate.sh`

The verifier runs against an isolated local `comind_ci` PostgreSQL database. It applies the current schema, FinOps prerequisites, current-runtime budget authority adapter migrations, then the Foundry substrate migration twice to prove idempotency.

The SQL verification proves:

- Required Foundry tables exist.
- RLS is enabled on each new table.
- Client roles are not granted direct table access.
- Broad `TRUE` RLS policies are absent.
- Forbidden payload, secret, token, and duplicate accounting columns are absent.
- The Foundry trigger function has fixed `search_path`.
- A fixture Foundry profile, capability, grant, authorization request, authorization decision, budget binding, execution context, deliberation, recovery checkpoint, and adapter operation can be linked end to end.
- Duplicate active capability grants are rejected.
- Append-only provenance records reject update and delete attempts.

## CI

The CI workflow adds a dedicated `foundry-agent-substrate` job using `postgres:17` with `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comind_ci`. The job runs `bash ./scripts/test_foundry_agent_substrate.sh`.

## Boundaries

This milestone remains implementation substrate only. It does not satisfy the Foundry Activation Blueprint by itself. PROOF and RADAR acceptance conditions still need follow-on runtime and governance milestones before autonomous Foundry operation is implementation-ready.
