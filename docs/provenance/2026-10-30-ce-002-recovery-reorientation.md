# CE-002 Recovery and Reorientation Protocol Automation Provenance

Date: 2026-10-30
Issue: #338
Pull request: #345
Branch: `ce-002-recovery-reorientation-automation`
Environment: repository plus Supabase Test
Production activation: none
Paid provider execution: none

## Authority

Joseph Hogarth directed CE-002 implementation under the canonical CoMind Development Environment Contract.

Existing authority controls remain binding. CE-002 does not authorize Production activation, destructive Production mutation, paid provider execution, autonomous merge/deployment, or expansion beyond existing C0-C4 boundaries.

## Objective

Automate the CE-001 recovery protocol with the smallest deterministic coordination layer that can restore trustworthy orientation after reasoning failure, lost context, stale conversational state, interrupted tools, or explicit recovery requests without inventing missing state or making the human reconstruct recoverable work.

## Freshness and lane history

CE-002 has stayed within one issue, one branch, and one PR while `main` continued to advance.

1. The lane was initially leased from `main` at `86c0ec6237e7867b77bd1d89433aea918939762e`, after CE-001 and CUX-002 were merged.
2. HUD-MAIL-001 then advanced `main` to `8c9d385fa3479c32aa2e1369607e93c3254e1152`. Collision review showed the seven CE-002 files were additive and isolated, so the same branch was reconciled through merge-style commit `d5c377d66e50bc8168a163aca3459323b1d10c33` rather than creating a second lane or accepting a stale base.
3. Exact-head CI on that candidate found a focused-test environment defect. The repair commit was `e7e2345401060e436a5d109031bc8d824c07f16f`.
4. While the repaired candidate was being verified, HUD-STATE-001 PR #344 advanced `main` again to `88c60a6da7bc7682ce41b5f8c5ed6d1502a2699b`. A fresh compare again showed only the seven CE-002 additive files and no overlapping modification.
5. The final freshness reconciliation therefore preserves the same CE-002 branch history while re-anchoring onto `88c60a6da7bc7682ce41b5f8c5ed6d1502a2699b`. The provenance-bearing reconciliation commit requires its own final exact-head acceptance run before review readiness.

This sequence is intentional Development Contract behavior: freshness is a continuing condition, not a one-time preflight.

## Collision review

Active and recently merged lanes were inspected before and during implementation.

Material adjacent lanes included:

- CUX-002, already merged before CE-002 implementation;
- HUD-MAIL-001, Operator Console Workspace Mail presentation;
- TK-CONSOLE-001, stacked Operator Console ThreadKeeper visibility;
- HUD-STATE-001, deployment-state wording reconciliation;
- MDO-002, provider-neutral MDO planning runtime and tests;
- older lane-health proof branches, controlled workflow fixtures that must not merge;
- older BRAND, SDN, PI, Notebook, and OC drafts that do not own the CE-002 server path.

CE-002 uses isolated paths under `server/src/continuous-excellence`, a focused server test, one additive recovery-specific database index migration, a dedicated workflow, and CE-002 documentation. It does not edit active Console presentation or MDO runtime implementation files.

## Reuse-before-reinvention result

A new recovery platform is unnecessary.

Existing reusable capability:

1. CE-001 provides immutable recovery signals, versioned Continuity Capsules, current-capsule projection, improvement lifecycle, evidence links, and controlled append functions.
2. Durable RunBook provides append-only operational chronology and current work-state projection.
3. ACP continuity recovery restores integrity-checked conversation checkpoints and reconciles uncertain operations against canonical Foundry adapter results and fenced work leases without blind replay.
4. ThreadKeeper provides accepted checkpoint lineage, unresolved continuity cases, stale expected-checkpoint detection, and a provider/actor-neutral handoff that does not transfer execution authority.
5. Canonical `comind.cm_task` provides task lifecycle identity.
6. Approved connected systems such as GitHub, Supabase, CI, files, and deployments remain authoritative for their own state and enter the deterministic recovery core through explicit provenance-bearing observations.

CE-002 therefore implements only the missing coordination layer.

## Repository implementation

Added:

- `server/src/continuous-excellence/recovery.ts`
- `server/test/ce-002-recovery-reorientation.test.mjs`
- `db/migrations/20261030_001_ce_002_recovery_idempotency.sql`
- `db/migrations/verify_20261030_001_ce_002_recovery_idempotency.sql`
- `docs/architecture/ce-002-recovery-reorientation.md`
- `.github/workflows/ce-002-recovery-reorientation.yml`
- this provenance record

The adapter separates read-only resolution from durable persistence.

### Read-only recovery resolution

`resolveRecovery(...)` reconciles:

- current CE Continuity Capsule;
- canonical task state;
- Durable RunBook state;
- optional ThreadKeeper continuity handoff;
- optional ACP checkpoint/Foundry outcome recovery;
- bounded authoritative observations supplied by approved connector callers.

It returns exactly one recovery classification:

- `complete`
- `ready`
- `partial`
- `blocked`
- `uncertain`

Unknown authority and material contradictions fail closed as `uncertain`. Known blockers and approval boundaries become `blocked`. Missing or degraded material dependencies become `partial`. Automatic continuation is identified only when state is `ready` and continuation authority is explicitly `authorized`.

The resolution phase does not write to CE, RunBook, ThreadKeeper, ACP, Foundry, or external systems.

### Durable persistence

`persistRecoveryOutcome(...)` composes existing accepted write paths:

- `comind.record_ce_signal(...)`
- `comind_pm.record_runbook_event(...)`
- `comind.capture_ce_continuity_capsule(...)`

The recovery interrupt identity acts as the durable source identity. Sequential replay checks existing RunBook and Capsule evidence before appending. A successor Continuity Capsule is created only when the trustworthy continuation state materially changes.

No CE historical `UPDATE`, `DELETE`, or `TRUNCATE` path is introduced.

## Recovery idempotency hardening

Self-review exposed one real concurrency gap in the inherited CE-001 substrate: CE-001 serializes Capsule writers with an advisory lock, but two concurrent replays of the same recovery interrupt could still serialize into two valid successor Capsule versions because the generic Capsule function did not make a recovery source identity unique.

CE-002 adds the narrow partial unique index `cm_ce_recovery_capsule_source_uq` over project, task, capsule key, and recovery source reference for `continuous_excellence` `ce-recovery://...` Capsules.

This does not create a second persistence system. It strengthens the existing CE-001 Capsule substrate specifically for recovery replay identity.

A direct Supabase Test preflight found no conflicting existing recovery identities. The migration applied successfully in Test only. A rolled-back behavioral verification proved:

- the first recovery Capsule is accepted;
- a duplicate recovery source identity is rejected;
- exactly one recovery Capsule identity exists inside the verification transaction;
- no synthetic verification rows survive rollback.

The migration is also reapplied in isolated PostgreSQL 17 CI to prove migration idempotency.

## Supabase advisor review

Security advisor review found no new CE-002-specific security surface. Existing project-wide findings remain outside this lane, including intentional CE private-table RLS-with-no-browser-policy findings inherited from CE-001 and older unrelated function/RPC findings.

Performance advisor review found no new CE-002 foreign key. The new recovery uniqueness index is expected to be unused before meaningful recovery workload accrues. Broader pre-existing performance findings were not expanded into CE-002 scope.

## ThreadKeeper boundary

CE-002 consumes `resolveContinuityHandoff(...)`. It does not create or accept ThreadKeeper checkpoints and does not inherit ThreadKeeper authority.

- stale expected checkpoint -> authoritative conflict -> `uncertain`;
- inconsistent lineage -> authoritative conflict -> `uncertain`;
- missing scope/checkpoint -> unavailable dependency -> `partial`;
- blocked continuity case -> `blocked`;
- unresolved non-blocked cases -> `partial`;
- clean accepted handoff -> verified recovery source.

## ACP boundary

CE-002 consumes `coordinateRecovery(...)`.

- `READY` -> verified ACP source;
- `ABSENT` -> partial recovery;
- `DEGRADED` -> partial recovery;
- `BLOCKED` -> state conflict / uncertain recovery.

CE-002 never blindly replays protected Foundry work during resolution.

## Connected-system boundary

Network and connector access remains outside the deterministic resolver. An approved caller can supply explicit authoritative observations containing source system, source reference, subject, status, and summary.

This keeps the recovery core provider-neutral and deterministically testable while preserving provenance and explicit conflict/unavailability semantics. Conversational claims never silently outrank authoritative connected-system state.

## Deterministic verification contract

Focused tests cover:

1. complete CE/task/RunBook agreement;
2. ready continuation with verified connected-system observations;
3. unavailable dependency -> partial;
4. explicit human-authority boundary -> blocked;
5. authoritative conflict -> uncertain;
6. canonical task/RunBook terminal disagreement;
7. ThreadKeeper stale-checkpoint conflict;
8. ThreadKeeper accepted handoff;
9. ACP degraded recovery;
10. repeated recovery friction -> improvement recommendation;
11. material recovery -> successor Capsule;
12. idempotent replay -> no duplicate RunBook or Capsule history in normal serialized replay;
13. non-material recovery -> no Capsule churn;
14. read-only resolution emits no mutation SQL;
15. database uniqueness prevents concurrent duplicate recovery Capsule identities.

The dedicated workflow also runs the complete server regression suite.

## First exact-head CI failure and Continuous Excellence loop

The first exact-head server candidate `d5c377d66e50bc8168a163aca3459323b1d10c33` compiled successfully and passed dependency audit, but the focused test failed before assertions because server module initialization required `DATABASE_URL` and the test process had not established that environment contract.

This was not repaired by weakening server configuration or by injecting a CE-specific exception into every workflow. The repair was made at the actual abstraction boundary: the focused test now establishes a bounded non-production `DATABASE_URL` before dynamically importing the compiled recovery and ThreadKeeper modules.

Canonical CE evidence:

- failure evidence: `cd4b7a6f-8c32-4ed4-ac59-f14c3b97d7bb`
- failure signal: `73b23417-6fda-47ca-9133-47bffb7ebb8a`
- RunBook failure event: `49451a71-3098-46c7-9c5f-f23d7b11f665`
- systemic improvement: `30e4c076-b00c-4e0c-a107-adbedce15e5b`
- proposed event: `d82300ec-28d0-466c-9859-70a37cd159db`
- implemented event: `2ee6cca9-6cfb-4ba6-b72c-11a093d23833`
- validated event: `a55a5a81-cf61-481a-96c8-0f1b591af5d6`

The repair commit was `e7e2345401060e436a5d109031bc8d824c07f16f`.

## Repaired acceptance evidence before final freshness reconciliation

Dedicated CE workflow run `41019850404` passed on repaired head `e7e2345401060e436a5d109031bc8d824c07f16f`:

- PostgreSQL 17 database-idempotency contract: success;
- migration reapplication: success;
- recovery replay verification: success;
- dependency audit: success;
- TypeScript/server build: success;
- focused deterministic recovery tests: success;
- complete server regression suite: success.

Generic CI run `41019850440` also passed its complete matrix, including ordinary server tests, dependency audit, devcontainer runtime, real HTTP/PostgreSQL verification, browser/reload persistence, conversation lifecycle, PM ledger, Foundry substrate, SDN Test ingestion, and FinOps budget authority.

Additional exact-head guards passed on the repaired candidate, including No Placeholder, Implementation Integrity, Repository Configuration, Lane Health, DRB-002, Foundry work lease/runtime/terminal/readiness checks, Governed Provider Execution, and the Foundry one-shot synthetic handoff.

Acceptance evidence ID for the repaired dedicated run: `cf3a52c8-adf8-4278-9025-003331c6eabd`.

## Final freshness acceptance boundary

Because `main` advanced to `88c60a6da7bc7682ce41b5f8c5ed6d1502a2699b` after the repaired candidate was verified, the branch must be reconciled to that baseline and all exact-head acceptance gates must run again on the resulting candidate.

This document intentionally does not claim that later candidate has passed until those checks actually complete. Final exact-head CI evidence belongs in GitHub PR #345, the Durable RunBook, and the CE Continuity Capsule so recording it does not require another repository mutation that would invalidate its own exact-head result.

## Recovery and rollback

Repository changes remain isolated to issue #338, the single CE-002 branch, and PR #345.

Supabase changes are Test-only and additive. The recovery uniqueness index can be removed in Test if CE-002 is rejected, while all failure and verification evidence remains preserved.

If the final candidate fails acceptance, preserve the failure evidence and repair forward on the same branch. Do not represent partial execution as accepted.

Production activation remains separate and has not occurred.
