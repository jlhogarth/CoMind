# CE-004 Friction and Failure Register evidence

Date: 2026-10-30
Issue: #372
Branch: `ce-004-friction-failure-register`
Environment: repository plus bounded Supabase Test only
Production activation: false

## Initial status review

No pre-existing CE-004 issue, branch, pull request, canonical task, RunBook item, or Continuity Capsule was found.

The existing CE substrate already contained real friction/failure evidence, including historical CE-001 and CE-002 failures. CE-004 therefore addresses an observed lifecycle gap rather than creating a speculative subsystem.

The accepted CE architecture already supported:

- immutable `cm_ce_signal` observations;
- evidence links;
- improvement records/events;
- signal-to-improvement relationships;
- signal backlog projection.

It did not provide an authoritative signal disposition history for triage, diagnosis, deferral, resolution, no-action closure, reopening, recurrence risk, ownership, or explicit pattern identity.

## Reuse and collision review

Active lanes were inspected before branch creation.

No active lane owned the selected CE-004 paths or friction/failure signal lifecycle semantics.

Relevant boundaries:

- DRULE-005 owns shared RuleBook operational authority and governed runtime wrappers.
- IIC-005 owns Implementation Integrity / No Magic Configuration evolution.
- VE-STD-001 is VE engineering-standard documentation.
- Home/Watchtower consume CE attention projections but do not own CE signal lifecycle truth.
- MDO owns module-development orchestration.

CE-004 reuses CE-001, CE-002, CE-003, RunBook, canonical project/task identity, canonical evidence, and existing CE improvement linkage.

## Freshness lease

Immediately before branch creation, authoritative `main` was verified at:

`61ea87316aa5fd0aa702e530c4ba34aed3c61896`

Commit: `Merge HOME-002 governed Now read model`

The branch was created from that exact SHA.

## Durable lane registration

Issue:

https://github.com/jlhogarth/CoMind/issues/372

Canonical task:

`e9a0ca84-d793-4711-b659-e8a898ba9ede`

RunBook work item:

`0d5b15a1-db5b-4e5e-99ac-e9a5a6766719`

Continuity Capsule v1:

`b2d091f8-bde0-4539-a463-4289866e80c8`

Lane registration evidence:

`a9c46bb5-c2aa-4bc4-9575-2430c64ef5e1`

## Registration failure preserved

The first durable-registration transaction used `assistant` as the RunBook `actor_type`.

The live RunBook constraint accepts only:

- `human`
- `agent`
- `system`
- `connector`

PostgreSQL rejected the transaction before commit. A readback verified zero CE-004 task rows, RunBook rows, Capsules, and issue-evidence rows survived.

The registration was replayed with canonical `actor_type='agent'` and succeeded without weakening the RunBook constraint.

## Test-first sequence

The acceptance proofs were committed before the implementation files.

First:

- `db/migrations/verify_20261030_021_ce_004_friction_failure_register.sql`
- `server/test/ce-004-friction-failure-register.test.mjs`

Then implementation:

- `db/migrations/20261030_021_ce_004_friction_failure_register.sql`
- `server/src/continuous-excellence/friction-failure.ts`

Then:

- `.github/workflows/ce-004-friction-failure-register.yml`
- `docs/architecture/ce-004-friction-failure-register.md`
- this provenance record

The migration sequence was inspected before naming. Existing `20261030_020` was present, so CE-004 uses the next unused slot `20261030_021` rather than assuming an older CE-local sequence.

## Implementation decision

A new table is justified only for the missing append-only lifecycle history:

`comind.cm_ce_signal_event`

The original `cm_ce_signal` remains immutable observation truth.

Each CE-004 event stores the current classification snapshot for:

- owner;
- recurrence risk;
- optional explicit pattern key.

This choice avoids hidden inheritance semantics. A later event can explicitly change or clear a classification without modifying old events.

## Lifecycle safety

The constrained writer:

- accepts friction/failure signals only;
- serializes concurrent transition evaluation with a per-signal transaction advisory lock;
- requires triage as the first lifecycle event;
- validates a legal transition matrix;
- requires recurrence risk on every persisted lifecycle event;
- requires source provenance for terminal disposition;
- requires `details.disposition_reason` for `closed_no_action`;
- permits terminal re-entry only through explicit `reopened`;
- supports exact idempotent replay;
- rejects conflicting reuse of an idempotency key.

## Recurrence policy

CE-004 never groups signals from prose similarity.

Only an explicit current `pattern_key` creates recurrence identity.

The register derives pattern occurrence count and improvement-link coverage from that explicit key. A repeated material open pattern can recommend an improvement review, but CE-004 does not automatically create or approve an improvement.

## Cross-lane protection

`comind.v_ce_signal_backlog` is intentionally unchanged.

HOME-001/HOME-002 and Watchtower already consume it as an attention projection. CE-004 adds the new private `v_ce_friction_failure_register` instead of silently changing accepted attention semantics.

## Security posture

The new event table is RLS enabled and forced.

No browser/Data API role receives direct write privileges. `service_role` is limited to read access and execution of the constrained writer. Direct event INSERT/UPDATE/DELETE remains unavailable to `service_role`.

## Acceptance state

At this provenance checkpoint, exact-head CI has not yet been claimed as passed. The dedicated CE-004 workflow is the acceptance authority for:

- PostgreSQL 17 schema and transition proof;
- constrained privilege proof;
- deterministic server adapter;
- TypeScript build;
- production dependency audit;
- full server regressions.

Broad repository workflows and final freshness/collision checks remain required before review readiness.

No Production migration has been applied.
No paid provider call has been made.
No merge has been performed.
