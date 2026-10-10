# CoMind Live Supabase Read-Only Governance Evidence

Observation date: 2026-10-10
Project: CoMind (`sbgfuanxiqepcoboxzcl`)
Database: PostgreSQL 17.11
Method: read-only Supabase project metadata, Security Advisor, and catalog SELECT queries. No mutation, migration, DDL, DML, provider call, or production configuration change was performed.

## Executive result

The live CoMind database is materially behind the repository's Foundry/security-hardening design. The repository migrations and isolated verification must not be represented as deployed live controls.

This condition blocks production Virtual Employee autonomy until a separately authorized deployment/hardening milestone is verified.

## Verified observations

### Database tables and RLS

- `comind` table count: **79**.
- RLS enabled: **4** tables.
- RLS disabled: **75** tables.
- RLS-enabled tables: `cm_conversation`, `cm_doc`, `cm_doc_chunk`, `cm_message`.

The live state therefore matches the earlier documented observation of 75/79 tables lacking RLS and confirms the repository hardening migration has not been applied to this project.

### Broad policies on the four RLS-enabled tables

Read-only catalog inspection found unconditional `true` expressions in policies associated with:

- `cm_conversation`;
- `cm_doc`;
- `cm_doc_chunk`;
- `cm_message`.

These are evidence of broad scaffold-style policy behavior and must not be treated as production least-privilege authorization.

### Function search paths

Supabase Security Advisor reported **7** `function_search_path_mutable` findings at observation time, and catalog inspection showed no fixed `proconfig` search path for the same functions:

- `comind.set_updated_at()`
- `comind.fn_belief_update_beta(uuid, boolean, jsonb)`
- `comind.fn_create_causal_node_from_memory(uuid, text, text)`
- `comind.set_current_actor(uuid)`
- `comind.current_actor()`
- `comind.set_updated_at_checklist()`
- `comind.set_updated_at_research_refs()`

Supabase remediation reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### Foundry/governed-runtime schema

The following repository-designed tables were **not present** in the live `comind` schema at observation time:

- `cm_foundry_agent_profile`
- `cm_foundry_capability`
- `cm_foundry_execution_context`
- `cm_budget_authority_binding`

This means the current live database does not contain the later Foundry identity/capability/execution substrate or the budget-binding authority expected by repository code.

### Agent and module inventory

- `cm_agent` row count: **0**.
- `cm_module_registry` row count: **5**.

Live registered modules:

1. `SET Tier` — Superhuman Emulation Tier.
2. `Causal-Probabilistic Scaffold` — causal nodes, beliefs, ILP Layer-0 and Neuro-Symbolic Bridge.
3. `Legacy Beacon` — long-range ethical foresight based on the 7th Generation Principle.
4. `SOAP` — symbolic SOAP scaffold.
5. `Future Continuity` — continuity projection and IP safeguards.

The module registry therefore should not be confused with the Virtual Employee roster. No live `cm_agent` records existed at observation time.

### Supabase migration history

Only these migrations were recorded in the live Supabase migration history:

- `20261005213616_comind_base_v2_initial_build`
- `20261006051527_comind_pm_ledger_maintenance_package_v0_1`
- `20261006051627_comind_pm_ledger_hardening_v0_1_1`

Later repository migrations, including Foundry/security/FinOps runtime layers, are not represented in live migration history.

## Evidence-state changes

Based on this observation:

- Live RLS hardening: **GAP / VERIFIED NOT DEPLOYED**.
- Function search-path hardening: **GAP / VERIFIED NOT DEPLOYED**.
- Foundry agent profile/capability/runtime tables: **VERIFIED NOT DEPLOYED**.
- Live Virtual Employee instances in `cm_agent`: **NONE OBSERVED**.
- Foundry authorization/budget substrate: **VERIFIED NOT DEPLOYED**.
- Repository migrations/tests remain useful isolated evidence but cannot support a live-operation claim.

## Immediate governance implications

1. Do not activate ISO or any consequential Virtual Employee against this live database.
2. Do not enable production agent execution based on repository-only Foundry controls.
3. Do not apply the security/Foundry migrations from GOV-001; deployment belongs in a separate authorized implementation milestone with migration ordering, rollback, isolated verification, backup/recovery, and current Supabase advisor checks.
4. Reconcile repository migration dependencies against the three migration versions actually present in live Supabase before planning deployment.
5. Reassess Data API exposure and grants as part of hardening. Supabase has announced a platform change enforcing explicit exposure/grants for existing projects on 2026-10-30, so the live access model must be reviewed rather than inferred from older defaults.
6. Preserve this snapshot as baseline evidence for the AIMS risk register and future corrective action.

## Non-interference boundary

This evidence record does not alter PR #84 and does not authorize a new migration. PR #86 has since merged as repository/isolated work-lease evidence, and Interactive Runtime Performance baseline 008 has since merged as a monitoring reference. Neither change converts this live Supabase snapshot into deployed Foundry/security evidence.

## Required follow-on milestone

After current parallel development dependencies are reconciled, open a dedicated live-database readiness/hardening issue that:

- calculates the exact ordered migration delta from live migration history to intended repository schema;
- validates the delta against isolated PostgreSQL/Supabase first;
- performs a backup/recovery readiness check;
- validates RLS, grants, policies, function search paths and Data API exposure;
- deploys only with explicit production authority;
- re-runs Security Advisor and catalog verification afterward;
- captures the exact migration/deployment/test evidence needed to promote control state from repository/isolated to deployed/operating.

Until then, the live database remains outside the minimum security posture required for production Virtual Employee autonomy.
