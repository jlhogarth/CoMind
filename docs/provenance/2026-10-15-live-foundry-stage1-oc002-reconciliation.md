# Live Foundry Stage 1 OC-002 Reconciliation

Date: 2026-10-15

Issue: #123

Original Stage 1 readiness authority: Issue #116 / PR #117

Evidence state: repository implementation and read-only live reconciliation. This document is not live deployment authorization or live deployment evidence.

## Purpose

Reconcile the accepted Live Foundry Stage 1 budget-authority readiness package with the known Operator Console OC-002 live Supabase changes without weakening fail-closed migration drift detection.

## Reverified repository baseline

Authoritative main at Issue #123 creation:

`4d625c340f8864791d373640affec4aa99204a07`

The Stage 1 source migration set remains exactly six migrations. No Stage 1 migration content is changed by this issue.

## Active live schema authority

Operator Console Issue #118 / PR #119 held the active live CoMind Supabase schema-mutation lane during reconciliation.

Observed PR head:

`57d83293cb88f79e1910f3bff98d16f92ccf5c9c`

Issue #123 is repository-only. It does not release, share, or supersede that live authority.

## Reverified live Supabase baseline

Project ref:

`sbgfuanxiqepcoboxzcl`

Observed migration ledger:

1. `20261005213616 comind_base_v2_initial_build`
2. `20261006051527 comind_pm_ledger_maintenance_package_v0_1`
3. `20261006051627 comind_pm_ledger_hardening_v0_1_1`
4. `20261015211851 operator_console_live_activation_v0_2`
5. `20261015212201 operator_console_service_role_least_privilege_v0_2_1`
6. `20261015212719 operator_console_explicit_deny_policies_v0_2_2`

The accepted Issue #116 preflight failed closed because it expected only the first three migration names.

After Issue #123 reconciled the exact migration version/name pairs, the revised preflight was executed read-only against live Supabase and returned `technical_preflight_pass = true` with `c4_authorized = false` and an empty migration delta.

The live preflight observed:

- `comind`: 4 RLS-enabled tables and 75 RLS-disabled tables;
- `comind_pm`: 10 RLS-enabled tables and 0 RLS-disabled tables;
- `comind.cm_agent`: 0 rows;
- `comind.cm_agent_run`: 0 rows;
- `comind.cm_agent_step`: 0 rows;
- `comind.cm_tool_call`: 0 rows;
- `comind_pm.pm_agent_runs`: 0 rows;
- `comind.cm_org`: 1 row;
- `comind.cm_project`: 1 row;
- `comind.cm_actor`: 1 row;
- `comind_pm.pm_work_items`: 3 rows.

The following checked classes remained absent live:

- Stage 1 FinOps and current-runtime budget-authority relations and functions
- Foundry Agent substrate relations
- Foundry work-lease relations
- ACP continuity checkpoint relation
- ChatGPT Archive relations

## Security state

Supabase Security Advisor continued to report seven pre-existing `function_search_path_mutable` warnings in the `comind` schema.

A reconciliation error was detected and corrected during Issue #123 implementation. An initial semantic reading overstated the scope of OC-002 migrations `002` and `003`. Exact source inspection established the actual boundary:

- `20261015_001_operator_console_live_activation.sql` creates Operator Console support tables and functions in `public`, enables RLS on those support tables, and registers a bounded public relational surface;
- `20261015_002_operator_console_service_role_least_privilege.sql` narrows `service_role` privileges on the three Operator Console support tables only;
- `20261015_003_operator_console_explicit_deny_policies.sql` adds restrictive policies for `anon` and `authenticated` on the three Operator Console support tables only;
- none of those three migrations performs a blanket privilege rewrite or forced-RLS sweep across `comind` or `comind_pm`.

The live `comind` and `comind_pm` RLS state is therefore not evidence that OC-002 failed to apply.

The actual future compatibility boundary is in the shared `public` schema. Stage 1 creates its own `public.comind_*` FinOps relations and functions. Those Stage 1 objects must not become Operator Console administrative relations merely because they exist in `public`.

Required future checks:

- Stage 1 public relations remain absent from `operator_console_relation_registry` unless a separate governed decision explicitly delegates them;
- Operator Console administrative mutation remains registry-gated;
- Foundry runtime does not depend on the Operator Console administrative RPC;
- Stage 1 grants and RLS are verified independently of Operator Console controls.

## Dependency correction

The candidate deployment order originally placed security prerequisites before the Foundry Agent substrate.

Repository evidence requires the opposite order for migrations `006` and `007`:

1. `20261008_006_foundry_agent_substrate.sql`
2. `20261008_007_foundry_security_prerequisites.sql`

Migration `007` sweeps existing `comind` tables to force RLS, replace policies with restrictive policies, harden function search paths, and restrict privileges. Applying `007` before `006` would leave the later substrate tables outside that sweep.

This ordering does not authorize either migration for live deployment.

## Reconciled dependency graph

1. Frozen live baseline and exact recovery evidence
2. Stage 1 FinOps and current-runtime budget-authority foundation, six migrations only
3. Foundry Agent substrate, migration `006`
4. Foundry security prerequisites, migration `007`
5. Foundry runtime orchestration, migration `008`
6. Foundry work-lease kernel, migration `009`
7. ACP continuity checkpoints, migration `010`
8. Bounded Agent identity and capability population
9. PM ledger / Foundry telemetry bridge
10. First constrained shadow-mode Agent
11. Interruption and recovery proof
12. Operator Console authoritative readback

Governed paid-provider execution remains downstream of budget authority, Foundry authorization, runtime provenance, and telemetry controls.

## Issue #123 implementation

The Stage 1 manifest now records the six reviewed pre-Stage 1 migration version/name pairs and the observed Operator Console authority boundary.

The read-only preflight now compares exact migration version/name pairs rather than names alone.

Isolated readiness verification is designed to prove four states:

1. exact reviewed baseline passes;
2. a missing expected migration fails closed;
3. an unexpected additional migration fails closed;
4. removing the negative fixture restores the exact baseline to pass.

The isolated test models OC-002 migration provenance only. It does not claim to reproduce the full live Operator Console runtime. Operator Console public-registry non-exposure remains an explicit later compatibility gate for Stage 1 public objects.

## Rollback and forward-repair boundary

No blind schema-wide rollback is acceptable.

Before any future live Stage 1 write:

- capture the exact live migration ledger;
- capture exact-object recovery evidence for the Stage 1 object set;
- preserve Operator Console objects and state;
- verify protected row counts;
- verify no competing live schema-mutation lane exists.

If failure occurs before commit, use transaction rollback.

If failure occurs after committed DDL, freeze further DDL and paid-provider activity, verify protected state, then either restore only the exact reviewed Stage 1 object set from evidence-backed recovery material or apply a separately reviewed forward repair.

## Live deployment gate

Issue #123 does not authorize live mutation.

A future Stage 1 live deployment requires all of the following:

- Operator Console live schema-mutation authority has reached a terminal, explicitly released state;
- authoritative main and the live migration ledger are refreshed again;
- the reconciled preflight passes against that exact terminal baseline;
- no unknown migration drift exists;
- exact-object recovery evidence exists;
- C4 live mutation authorization is explicit for the Stage 1 deployment;
- the six Stage 1 migrations are applied in their reviewed order only;
- post-deployment contract verification passes;
- Agent rows remain unpopulated and no paid-provider execution occurs in Stage 1.

No Hallucinations. No Lies.
