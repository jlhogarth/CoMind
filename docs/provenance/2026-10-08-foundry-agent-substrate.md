# Foundry Agent Substrate Provenance

Date: 2026-10-08
Issue: #70
PR: #71
Branch: `issue-70-foundry-agent-substrate`
Base main SHA: `ca21f82fdf00b829ba4d0b63e5d511b448af722d`

## Scope

This milestone adds the first real database substrate for CoMind Foundry Agents and Virtual Employees in repository code only, and hardens the current `comind` schema prerequisites required before future governed autonomy. It does not mutate live Supabase, create live provider calls, execute paid token-count calls, or run an autonomous multi-agent production drill.

The Foundry substrate creates governed support tables for:

- Durable Foundry agent profiles that bind `cm_agent` records to `cm_actor` identities.
- Provider-independent capability definitions and scoped grants.
- Authorization requests and decisions.
- Execution context provenance that can link project, task, conversation, capability, authorization decision, and `cm_budget_authority_binding`.
- Deliberation sessions, participants, events, and outcomes.
- Recovery checkpoints.
- Adapter operation provenance using request fingerprints rather than raw sensitive payloads.

The security-prerequisite layer also addresses repository representations of the pre-existing `comind` schema rather than securing only the new Foundry tables.

## Read-only live security evidence

A read-only inspection of the live CoMind Supabase project on 2026-10-08 found:

- 79 current tables in schema `comind`.
- 75 of those 79 tables had row-level security disabled.
- Supabase Security Advisor reported exactly seven `comind` functions with mutable `search_path`:
  - `set_updated_at()`
  - `fn_belief_update_beta(uuid, boolean, jsonb)`
  - `fn_create_causal_node_from_memory(uuid, text, text)`
  - `set_current_actor(uuid)`
  - `current_actor()`
  - `set_updated_at_checklist()`
  - `set_updated_at_research_refs()`
- `db/sql/v2/10_rls_policies.sql` still contained unconditional `USING (true)` and `WITH CHECK (true)` scaffold policies for conversation, message, document, and chunk tables.

No live remediation was applied. Live Supabase remains unchanged until separately authorized.

## Security posture implemented in repository code

- Every new `comind.cm_foundry_%` table enables row-level security.
- `anon` and `authenticated` receive no direct table privileges on Foundry tables.
- Migration `20261008_007_foundry_security_prerequisites.sql` enables RLS on every current `comind` table discovered in the isolated schema and revokes table access from `PUBLIC`, `anon`, and `authenticated` where those roles exist.
- The migration removes unconditional `TRUE` policies in the `comind` schema rather than treating them as production authorization.
- The four-table scaffold policy file now removes its former broad policies and leaves backend-governed, deny-by-default access.
- All seven advisor-flagged functions have fixed `search_path = comind, public, pg_temp` in repository schema definitions and are reinforced by the migration.
- No raw prompt, response, credential, secret, API key, token, or duplicate monetary accounting columns are introduced.
- Append-only triggers protect authorization decisions, execution contexts, deliberation events, deliberation outcomes, recovery checkpoints, and adapter operations.
- Existing monetary authority remains the current governed budget authority. Foundry execution context links to it rather than creating a second ledger.

## Verification

Verifier files:

- `db/migrations/20261008_006_foundry_agent_substrate.sql`
- `db/migrations/verify_20261008_006_foundry_agent_substrate.sql`
- `db/migrations/20261008_007_foundry_security_prerequisites.sql`
- `db/migrations/verify_20261008_007_foundry_security_prerequisites.sql`
- `scripts/test_foundry_agent_substrate.sh`

The verifier runs against an isolated local `comind_ci` PostgreSQL database. It applies the current schema, FinOps prerequisites, current-runtime budget authority adapter migrations, Foundry substrate migration, and security-prerequisite migration. Both Foundry migrations are reapplied to prove idempotency.

The SQL verification proves:

- Required Foundry tables exist.
- RLS is enabled on each new Foundry table.
- RLS is enabled on every current `comind` table in the disposable schema.
- Client roles are not granted direct table access.
- Unconditional `TRUE` RLS policies are absent.
- All seven known security-advisor functions have fixed search paths.
- Forbidden payload, secret, token, and duplicate accounting columns are absent.
- A fixture Foundry profile, capability, grant, authorization request, authorization decision, budget binding, execution context, deliberation, recovery checkpoint, and adapter operation can be linked end to end.
- Duplicate active capability grants are rejected.
- Append-only provenance records reject update and delete attempts.

## Permanent gates

The dedicated `foundry-agent-substrate` CI job runs `bash ./scripts/test_foundry_agent_substrate.sh` against PostgreSQL 17. Existing application build/tests, conversation lifecycle, PM Ledger, FinOps, runtime budget authority, development runtime, repository configuration, and No Placeholder gates remain required. Final acceptance must use the exact PR head after all provenance updates, not an earlier successful commit.

## Boundaries and remaining work

This milestone remains repository and isolated-database implementation. It does not make the current live Supabase posture safe by itself because no live migration has been authorized or applied. It also does not satisfy the Foundry Activation Blueprint by itself. PROOF and RADAR still require green permanent gates on the final head, explicit evidence, and follow-on runtime/governance milestones before autonomous Foundry operation is implementation-ready.
