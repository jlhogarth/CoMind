# TK-007 C4 Live Test Role-Switch Repair

Date: 2026-10-27
Issue: #272
Prior merged substrate PR: #273
Failed live workflow: 40585675384
Failed live job: 122476769675
Environment: Supabase Test
Canonical maturity during repair: C3 Integrated
Production activation: false

## Failure retained as evidence

The first post-merge TK-007 live Test attempt failed before the sustained operational proof started.

The workflow supplied `PGOPTIONS=-c role=comind_threadkeeper_runtime` and expected the Node PostgreSQL client to begin each connection with `current_user=comind_threadkeeper_runtime`.

The runtime-role preflight observed:

- session/current user remained `postgres`;
- expected current user was `comind_threadkeeper_runtime`;
- the preflight failed closed;
- the sustained operational proof did not run;
- no C4 promotion occurred;
- production activation remained false.

A direct Supabase Test readback after the failure confirmed `comind.cm_threadkeeper_operation_event` contained zero rows. The failed attempt therefore created no partial ThreadKeeper operational event chain and required no cleanup or deletion.

## Root cause

The defect was not in the PostgreSQL role, RLS policies, grants, or ThreadKeeper data model. The defect was an application/workflow assumption: the live Node PostgreSQL connection did not assume the configured role through `PGOPTIONS` in the deployed Supabase connection path.

The isolated proof had passed because its connection environment behaved differently. This is retained as an environment-parity lesson and is why C4 promotion was intentionally gated behind a real Test run.

## Repair principle

Do not depend on an external startup option to establish ThreadKeeper authority.

ThreadKeeper now owns an explicit fail-closed database boundary that:

1. acquires the actual pooled PostgreSQL connection;
2. begins a transaction;
3. optionally establishes serializable isolation;
4. proves the session can `SET` the dedicated runtime role;
5. executes `SET LOCAL ROLE comind_threadkeeper_runtime`;
6. verifies the resulting current user and expected privilege shape;
7. optionally acquires the existing transaction-scoped advisory lock;
8. executes ThreadKeeper work only after successful role verification;
9. commits on success or rolls back on failure;
10. relies on `SET LOCAL ROLE` transaction scope so the assumed role cannot leak to a pooled connection after transaction end.

There is no fallback to unrestricted execution if role switching or privilege verification fails.

## Reused CoMind pattern

The repair adapts the existing governed archive database principle already present in `server/src/db.ts`: acquire the real database connection, prove role capability, explicitly switch to the constrained role, verify the assumed identity and privilege shape, and fail closed when the boundary cannot be established.

ThreadKeeper uses transaction-local switching rather than a session-wide role because pooled application connections must not retain authority state across unrelated borrowers.

## Repair-harness sequencing failure

The first integrated TK-007B repair head, `1a86676c6ee5f706d95b5e173627e63378427d09`, failed the isolated C4 workflow before reaching the new C4 assertions.

The failure occurred in the legacy TK-006 C3 PostgreSQL compatibility regression. Current `repository.ts` code now correctly routes checkpoint and case transactions through the constrained ThreadKeeper runtime boundary, but `scripts/test_threadkeeper_c3.sh` executed its C3 database tests before the TK-007 runtime-role migration had been applied. PostgreSQL therefore reported that `comind_threadkeeper_runtime` did not exist.

This was a test-bootstrap sequencing defect, not a relaxation candidate. No runtime fallback was added.

The correction is:

- the C3 database regression now installs and verifies the current TK-007 runtime schema after its C3 prerequisite migrations and before running current repository code;
- C3 evidence semantics remain C3 and the C3 matrix is unchanged;
- the test is explicitly a C3 compatibility regression under the current ThreadKeeper runtime schema, not a claim that C4 existed historically;
- the C4 wrapper no longer applies migration 007 a second time.

This preserves fail-closed runtime behavior while ensuring historical maturity regression tests execute against the schema required by current application code.

## Files

- `server/src/threadkeeper/database.ts`
  - `withThreadKeeperRuntimeTransaction`
  - `threadKeeperRuntimeQuery`
  - explicit role and privilege verification
  - rollback/discard behavior on failure
- `server/src/threadkeeper/repository.ts`
  - existing serializable/advisory-lock transactions now run through the constrained ThreadKeeper runtime boundary
- `server/test/threadkeeper-c4-runtime-role.test.mjs`
  - proves the role is assumed inside the ThreadKeeper transaction
  - proves the role is cleared after transaction completion
- `scripts/test_threadkeeper_c3.sh`
  - runs C3 compatibility regression against the current ThreadKeeper runtime schema
- `scripts/test_threadkeeper_c4.sh`
  - removes the `PGOPTIONS` assumption
  - reuses the runtime schema already bootstrapped by the C3 compatibility regression
- `.github/workflows/tk-007-threadkeeper-c4.yml`
  - removes the `PGOPTIONS` assumption
  - preserves a bounded JSON failure receipt even when a live preflight fails before the main operational artifact can be produced

## Acceptance before merge

This repair is acceptable only if the exact repair head passes:

- isolated TK-007 C4 proof;
- runtime-role assumption and role-leak negative proof;
- C3 compatibility regression under the current runtime schema;
- MCTRL;
- broad CI;
- freshness/race check against `main`.

After merge, the live Test proof must execute successfully against Supabase Test, preserve its artifact, and reconcile with the operation-event chain before any C4 promotion change is authored or applied.

## Promotion boundary

This repair does not promote ThreadKeeper. Until the replacement live Test proof is accepted:

- maturity remains C3 Integrated;
- `c4_gate_complete` is not asserted;
- no C4 promotion journal is written;
- production activation remains false.
