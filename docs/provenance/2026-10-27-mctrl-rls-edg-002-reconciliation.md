# MCTRL-RLS EDG-002 Reconciliation

Date: 2026-10-27
Issue: #270
Source change: EDG-002 / PR #269 / merge `2e6004165d532742c9f3415d1db4a30679efafed`
Environment: Test
Production/C4: unchanged

## Purpose

Resolve the MCTRL warning that reported `comind_development.entity` and `comind_development.relationship` with RLS enabled while `config/maintenance-control.v1.json` still expected RLS disabled.

## Finding

The RLS state is intentional governed security hardening introduced by EDG-002, not unexplained drift.

EDG-002 migration `db/migrations/20261027_006_edg_002_rulebook_graph_integration.sql` explicitly:

- enables RLS on both graph base tables;
- revokes all direct table privileges from `public`, `anon`, `authenticated`, and `service_role`;
- leaves no permissive RLS policies on the base tables;
- grants `service_role` only `SELECT` on `comind_development.v_rulebook_graph` and `comind_development.v_rule_graph_relationships`;
- grants `service_role` `EXECUTE` only on `comind_development.edg_sync_rulebook_projections(text,text)`;
- defines that sync function as `SECURITY DEFINER` with an empty pinned `search_path`.

This matches the EDG-002 acceptance contract that the graph remains a non-authoritative projection and that service access must use narrow governed surfaces rather than direct base-table DML.

## Live Test verification

Read-only inspection of the CoMind Test Supabase project on 2026-10-27 observed:

- `comind_development.entity`: RLS enabled, force RLS false, 0 policies, 0 direct grants to `PUBLIC`, `anon`, `authenticated`, or `service_role`;
- `comind_development.relationship`: RLS enabled, force RLS false, 0 policies, 0 direct grants to `PUBLIC`, `anon`, `authenticated`, or `service_role`;
- `service_role` direct base-table `SELECT`: false for both graph tables;
- `service_role` `SELECT` on both EDG governed views: true;
- `service_role` `EXECUTE` on `edg_sync_rulebook_projections(text,text)`: true;
- `anon` and `authenticated` execute on the sync function: false;
- sync function `SECURITY DEFINER`: true;
- sync function `search_path`: empty and pinned.

No database mutation was required for this reconciliation.

## Best-practice check

The resulting posture is consistent with current Supabase guidance:

- grants and RLS are separate control layers;
- `service_role` bypasses RLS, so denying it direct base-table grants is meaningful least privilege;
- `SECURITY DEFINER` functions require careful execute grants and a pinned `search_path`;
- internal objects should expose only the minimum required surface.

References:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api

## Reconciliation change

`MCTRL-RLS-001` is updated only for these two relations:

- `comind_development.entity`: expected RLS `false` -> `true`
- `comind_development.relationship`: expected RLS `false` -> `true`

All other declared MCTRL RLS expectations remain unchanged.

## Acceptance condition

The change is acceptable only if repository CI and MCTRL validate the updated baseline without introducing a new warning or failure. The change does not weaken database security, add policies, grant new base-table access, alter EDG rule projections, change ThreadKeeper maturity, or activate production.
