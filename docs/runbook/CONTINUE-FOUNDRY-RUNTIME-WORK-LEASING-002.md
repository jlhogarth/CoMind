# Continue Foundry Runtime and Work Leasing 002

Issue: https://github.com/jlhogarth/CoMind/issues/158

The Test-stage runtime-orchestration and work-lease schema milestone is complete when the Issue #158 hardening PR merges with exact-head CI green.

Verified Test state on 2026-10-21:

- canonical runtime migration 008 instantiated;
- canonical work-lease migration 009 instantiated;
- lease RPC PUBLIC/anon/authenticated EXECUTE removed;
- service-role-only lease RPC EXECUTE verified;
- lease RPC search paths pinned to `pg_catalog, comind`;
- canonical synthetic lease lifecycle passed inside a rollback transaction;
- zero tasks, Agents, leases, lease events, execution contexts, adapter operations, adapter results, or execution outcomes remain from verification;
- no worker loop, Agent activation, provider/model execution, production mutation, or migration 007 activation occurred.

Future operating-Agent work is a separate lane. Do not reopen this milestone merely to add a worker, provider adapter, production security sweep, or production deployment.
