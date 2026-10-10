# Foundry work lease kernel provenance

Date: 2026-10-09
Issue: https://github.com/jlhogarth/CoMind/issues/85
Pull request: https://github.com/jlhogarth/CoMind/pull/86
Authoritative base: `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`

## Purpose

Issue #85 adds the first narrow PostgreSQL work-dispatch lease kernel for the Foundry substrate. It is anchored to existing `comind.cm_task` rows and does not replace project-management, authorization, capability, budget, provider, or settlement authorities.

The kernel is deliberately small:

- opt-in `cm_foundry_work_lease` rows linked one-to-one with `cm_task`;
- bounded `SKIP LOCKED` claims for eligible work;
- opaque lease token plus monotonic fencing epoch;
- bounded lease duration and renewal;
- stale-owner rejection for renew and finish;
- completed, released, reclaimed, and exhausted terminal transitions;
- append-only significant lease lifecycle events.

## Safety boundaries

This milestone is repository-only and isolated. It does not start a worker, poll continuously, dispatch adapters, call OpenAI, mutate a live database, deploy to production, or grant execution authority.

Lease ownership is only a concurrency primitive. A worker that holds a lease still needs the existing Foundry authorization, capability grant, budget authority, and adapter-specific safety checks before doing any real work.

No database transaction is held during adapter execution. Lease renewals do not append heartbeat events; only significant transitions are written to `cm_foundry_work_lease_event`.

## Operational contract

`cm_foundry_claim_work(worker, lease_seconds)` atomically selects one ready or expired eligible row, ordered by task priority, `not_before`, and task id. It increments `attempt_count` and `fencing_epoch`, assigns a fresh token, records the worker id, and inserts either `claimed` or `reclaimed`.

`cm_foundry_renew_work(task, worker, token, epoch, seconds)` succeeds only for the current unexpired owner tuple.

`cm_foundry_finish_work(task, worker, token, epoch, complete)` succeeds only for the current unexpired owner tuple. A successful completion moves to `completed`; an unsuccessful attempt either returns the row to `ready` or moves it to `exhausted` when `attempt_count >= max_attempts`.

The dispatch index is partial on `state IN ('ready','leased')` and ordered fields used by the claim path. The claim query locks only the candidate lease rows with `FOR UPDATE OF l SKIP LOCKED`.

## Deterministic verification

The permanent `Foundry Work Lease Kernel` workflow uses PostgreSQL 17 plus pgvector with only the local `comind_ci` database.

`scripts/test_foundry_work_lease_kernel.sh`:

1. rejects non-local and non-`comind_ci` database targets;
2. runs the existing Foundry substrate and security prerequisite verification;
3. applies the Issue #85 migration;
4. reapplies it to prove restart-safe migration execution;
5. runs the SQL verifier for claim, renewal, expiry, reclaim, stale-owner rejection, exhaustion, and significant event count;
6. runs an independent-connection Node integration test.

The integration test proves:

- only one worker claims a single eligible task when eight independent PostgreSQL pools contend concurrently;
- expired leases can be reclaimed with a new fencing epoch;
- stale owners cannot renew or finish after reclaim;
- blocked, done, future, and exhausted work are not claimable.

## Performance and regression notes

The critical claim path is one indexed candidate scan plus a row lock on the lease table. It does not lock `cm_task` rows and uses `SKIP LOCKED` to prevent one busy worker from blocking others. Lease duration is bounded to 5 through 300 seconds, and worker identifiers are bounded to 128 characters.

This is sufficient for deterministic substrate validation. Before production activation, the runtime worker layer still needs load benchmarks for expected task cardinality, connection-pool occupancy, renewal cadence, retry policy, and crash recovery under realistic workload.

## Safety state

Issue #85 verification uses:

- no live database mutation;
- no paid OpenAI or other provider request;
- no live provider token counting;
- no production deployment;
- no autonomous Foundry worker;
- no external adapter execution;
- no committed credentials.
