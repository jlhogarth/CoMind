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

The accepted Issue #116 preflight failed closed because it expected only the first three migration names. All other technical gates evaluated during the live read-only reconciliation passed.

The following checked classes remained absent live:

- Stage 1 FinOps and current-runtime budget-authority relations and functions
- Foundry Agent substrate relations
- Foundry work-lease relations
- ACP continuity checkpoint relation
- ChatGPT Archive relations

Checked Agent, Agent-run, tool-call, PM Agent-run, memory, message, task, milestone, document, and evidence row counts remained zero.

## Security state

Supabase Security Advisor continued to report seven pre-existing `function_search_path_mutable` warnings in the `comind` schema.

OC-002 materially changes the privilege environment even though it does not edit Foundry migration files. Its live least-privilege and explicit-deny controls restrict `service_role` access and force RLS across `comind` and `comind_pm`.

Consequences for future Foundry deployment:

- future Foundry relations in `comind` must be verified against inherited/default privilege behavior;
- runtime writes must not assume unrestricted raw `service_role` DML;
- controlled write functions and authorization paths must be verified after the Foundry substrate exists;
- the Operator Console security posture must not be weakened to make Foundry activation easier.

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

Isolated readiness verification now proves three states:

1. exact reviewed baseline passes;
2. a missing expected migration fails closed;
3. an unexpected additional migration fails closed;
4. removing the negative fixture restores the exact baseline to pass.

The isolated test models OC-002 migration provenance only. It does not claim to reproduce the entire live Operator Console runtime or privilege surface. That live privilege interaction remains a later explicit compatibility gate.

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
