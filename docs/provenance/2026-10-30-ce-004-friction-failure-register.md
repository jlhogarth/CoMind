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

## Pre-acceptance self-review repair

Initial candidate:

`8b9f5081fa2226ffd4501f360a0ae95f2d392bb5`

Before queued Actions runners reached the focused server test, self-review found that the synthetic register-row fixture omitted the projection field `pattern_linked_improvement_count` even though the adapter intentionally requires and validates that column.

The implementation contract was correct. The test fixture was incomplete.

The fixture was corrected without changing the adapter or database contract. Corrected candidate:

`c0a909d4aed43bdcfa103687571197938e84492e`

All acceptance claims for the earlier candidate were discarded.

## First exact-head PostgreSQL verifier failure

Dedicated CE-004 run:

`41044632350`

Database job:

`124025604066`

The following steps passed on exact head `c0a909d4aed43bdcfa103687571197938e84492e`:

- exact-head checkout and verification;
- PostgreSQL 17 startup;
- CE-001 prerequisite build;
- CE-001 foundation migration;
- CE-001 improvement ordering migration;
- CE-004 migration build.

The database acceptance verifier then failed with:

`CE-004 recurrence risk is required and must be valid`

The failing synthetic call attempted a valid `diagnosed` lifecycle transition with recurrence risk `NULL`.

That contradicted the intentional CE-004 classification contract: every persisted lifecycle event carries the complete current classification snapshot, including non-null recurrence risk. The schema was enforcing the intended rule.

The server-side exact-head job independently passed:

- production dependency audit;
- TypeScript build;
- focused CE-004 adapter tests;
- full server regression suite.

The failure was therefore classified as a verifier-fixture defect, not an implementation defect.

Durable CE failure signal:

`5e7cf502-79df-4b3c-8628-f6e9d44ffe0b`

Failure Continuity Capsule v3:

`a4b69a8a-6f5e-4d4a-9431-33f7c337bfee`

State:

`partial / verified`

The repair changed only the valid diagnosed verifier fixture from recurrence risk `NULL` to the already-established `moderate` classification. The migration and server adapter were not weakened.

Repair commit:

`a073bcd72b60c9c0db466cfba66351d9703176c4`

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

The final accepted candidate must include this provenance update and must rerun the dedicated and broad exact-head gates. Broad repository workflows and final freshness/collision checks remain required before review readiness.

No Production migration has been applied.
No paid provider call has been made.
No merge has been performed.
