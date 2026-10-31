# Foundry Runtime and Work Leasing 002 Test evidence

Date: 2026-10-21
Issue: https://github.com/jlhogarth/CoMind/issues/158
Test project: `sbgfuanxiqepcoboxzcl`
Authoritative main before this lane: `cf7803c2200291476c66f2808bfa5fef0751165c`

## Scope

This milestone instantiates the already accepted Foundry runtime-orchestration and work-lease kernel schema in the CoMind Test Supabase project. It does not start an Agent, worker, polling loop, provider/model call, paid execution, external adapter, production service, or identity activation. Migration 007 remains outside this bounded task.

## Applied Test migrations

The canonical repository migrations were applied first without semantic modification:

- `20261021212122 foundry_runtime_orchestration_test_v1`, from `db/migrations/20261008_008_foundry_runtime_orchestration.sql`.
- `20261021212137 foundry_work_lease_kernel_test_v1`, from `db/migrations/20261009_009_foundry_work_lease_kernel.sql`.

Post-activation inspection found PostgreSQL's default PUBLIC function EXECUTE privilege on the three lease RPCs. Although `anon` and `authenticated` had no `comind` schema USAGE and therefore could not invoke them, Issue #158 requires an explicit service-role-only RPC boundary. Two additive hardening migrations were therefore applied and are repository-tracked on this lane:

- `20261021212336 foundry_work_lease_rpc_acl_hardening_test_v1`, corresponding to `db/migrations/20261021_011_foundry_work_lease_rpc_acl_hardening.sql`.
- `20261021212427 foundry_work_lease_rpc_search_path_hardening_test_v1`, corresponding to `db/migrations/20261021_012_foundry_work_lease_rpc_search_path_hardening.sql`.

The first removes default PUBLIC/anon/authenticated EXECUTE and grants EXECUTE explicitly to `service_role`. The second pins the three lease RPCs to `search_path = pg_catalog, comind`.

## Verification

Live readback after all four Test migrations established:

- runtime terminal-result tables, work-lease tables, and claim/renew/finish functions all exist;
- RLS is enabled on `cm_foundry_adapter_operation_result`, `cm_foundry_execution_outcome`, `cm_foundry_work_lease`, and `cm_foundry_work_lease_event`;
- `anon` and `authenticated` have no `comind` schema USAGE and no EXECUTE on claim, renew, or finish;
- `service_role` has `comind` schema USAGE and EXECUTE on all three lease RPCs;
- runtime result/outcome tables grant service-role SELECT/INSERT only;
- the mutable lease row grants service-role SELECT/INSERT/UPDATE, while the append-only event table grants SELECT/INSERT only;
- the Supabase security advisor no longer reports any of the three lease RPCs under `function_search_path_mutable`; seven older unrelated functions remain for LF-3/security work;
- RLS-without-policy informational findings remain intentional for private fail-closed relations and do not create public API access.

The canonical synthetic lease lifecycle was then executed inside a transaction and rolled back. It proved initial claim, double-claim exclusion, foreign-renew rejection, valid renewal, expired-owner finish rejection, reclaim with fencing epoch 2, stale-owner renew/finish rejection, exhaustion, and three significant lifecycle events. Post-rollback counts were zero for tasks, Agents, work leases, and work-lease events.

No execution-context, adapter-operation, runtime-result, or execution-outcome rows were introduced.

## Repository verification baseline

At authoritative main `cf7803c2200291476c66f2808bfa5fef0751165c` before this activation lane:

- Foundry Runtime Orchestration workflow run `39373378606` completed successfully.
- Foundry Work Lease Kernel workflow run `39373378615` completed successfully.

These workflows provide deterministic PostgreSQL 17 isolated verification for the canonical runtime and lease migrations. Exact-head CI for the two additive hardening migrations must pass on this lane before merge.

## Boundary

This is Test schema activation and verification only. It is not evidence of an operating AI Agent, autonomous worker, production runtime, provider execution, or production authorization.
