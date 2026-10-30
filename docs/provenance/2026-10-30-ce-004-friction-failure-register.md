# CE-004 Friction and Failure Register evidence

Date: 2026-10-30
Issue: #372
Branch: `ce-004-friction-failure-register`
Environment: repository plus bounded Supabase Test only
Production activation: false

## Initial status review

No pre-existing CE-004 issue, branch, pull request, canonical task, RunBook item, or Continuity Capsule was found.

The existing CE substrate already contained real friction/failure evidence, including historical CE-001 and CE-002 failures. CE-004 therefore addresses an observed lifecycle gap rather than creating a speculative subsystem.

The accepted CE architecture already supported immutable `cm_ce_signal` observations, evidence links, improvement records/events, signal-to-improvement relationships, and signal backlog projection. It did not provide an authoritative signal disposition history for triage, diagnosis, deferral, resolution, no-action closure, reopening, recurrence risk, ownership, or explicit pattern identity.

## Reuse and collision review

Active lanes were inspected before branch creation. No active lane owned the selected CE-004 paths or friction/failure signal lifecycle semantics. CE-004 reuses CE-001, CE-002, CE-003, RunBook, canonical project/task identity, canonical evidence, and existing CE improvement linkage.

Relevant boundaries:

- DRULE-005 owns shared RuleBook operational authority and governed runtime wrappers.
- IIC-005 owns Implementation Integrity / No Magic Configuration evolution.
- VE-STD-001 is VE engineering-standard documentation.
- Home/Watchtower consume CE attention projections but do not own CE signal lifecycle truth.
- MDO owns module-development orchestration.

## Durable lane registration

Issue: https://github.com/jlhogarth/CoMind/issues/372

Canonical task: `e9a0ca84-d793-4711-b659-e8a898ba9ede`

RunBook work item: `0d5b15a1-db5b-4e5e-99ac-e9a5a6766719`

Continuity Capsule v1: `b2d091f8-bde0-4539-a463-4289866e80c8`

Lane registration evidence: `a9c46bb5-c2aa-4bc4-9575-2430c64ef5e1`

The first durable-registration transaction used noncanonical RunBook actor type `assistant`. PostgreSQL rejected it atomically. Readback verified zero partial CE-004 task, RunBook, Capsule, or issue-evidence state. Registration was replayed with canonical `actor_type='agent'` without weakening the RunBook constraint.

## Test-first implementation

The acceptance verifier and focused server test were committed before implementation. CE-004 then added the append-only `comind.cm_ce_signal_event` lifecycle, the constrained `record_ce_signal_event(...)` writer, private `v_ce_friction_failure_register`, and deterministic server adapter.

Lifecycle safety includes serialized per-signal transition evaluation, first-event triage, legal transition enforcement, recurrence-risk snapshots on every persisted event, terminal provenance, no-action disposition reason, explicit reopen from terminal states, exact idempotent replay, and conflicting replay rejection.

Recurrence is explicit only. Similar prose is never treated as recurrence unless a reviewed caller supplies the same `pattern_key`.

The original `cm_ce_signal` remains immutable observation truth. Existing `comind.v_ce_signal_backlog` semantics remain unchanged.

## Preserved pre-acceptance failures

Self-review found that an initial synthetic register-row fixture omitted `pattern_linked_improvement_count`. The fixture was corrected without changing runtime semantics.

Dedicated exact-head PostgreSQL verification later failed because a valid `diagnosed` verifier fixture passed recurrence risk `NULL`. The schema correctly rejected it. The failure was preserved as CE signal `5e7cf502-79df-4b3c-8628-f6e9d44ffe0b`. Only the verifier fixture was repaired to retain the established `moderate` recurrence-risk snapshot. The migration and server adapter were not weakened.

## DRULE-005 reconciliation

DRULE-005 merged while CE-004 acceptance was running. CE-004 was reconciled onto main with both histories preserved. DRULE-005 paths were disjoint from CE-004 and its authority contract remained compatible: RuleBook owns operational authority for its execution paths while CE-004 owns friction/failure signal lifecycle state.

## Supabase Test proof

CE-004 was applied and verified in canonical CoMind Supabase Test only. Historical CE failure signals projected as `untriaged` without historical mutation. The event table retained zero rows after migration until explicit lifecycle writes. `service_role` had constrained writer execution but no direct event INSERT, UPDATE, or DELETE authority. A rollback-only proof exercised an existing CE-002 failure through the constrained path and left zero durable lifecycle events afterward.

Supabase migration history records the logical migration name `ce_004_friction_failure_register`; Production was not migrated or activated.

## Final merge-authorized freshness reconciliation

After Joseph explicitly authorized merge of PR #373, `main` had advanced by 36 commits from the previously accepted base to:

`35e156dab1a586e4103a727b843ab8bba09530c3`

The newer mainline includes GER-001, MDO-003, RLIB-002, and related accepted work. A full compare showed those changes were path-disjoint from CE-004's seven files.

A second collision scan found a migration-namespace conflict that path comparison alone could not detect: current main already contained `db/migrations/20261030_021_rlib_001_governed_research_library.sql`, while CE-004 also used the `_021` repository migration slot.

CE-004 was therefore not merged stale. The next unused repository migration slot, `_025`, was verified unused. The CE-004 migration and verifier were renamed to:

- `db/migrations/20261030_025_ce_004_friction_failure_register.sql`
- `db/migrations/verify_20261030_025_ce_004_friction_failure_register.sql`

The migration SQL and verifier semantics were unchanged. The CE-004 workflow was updated to execute the `_025` paths. The branch was reconstructed on current main with both histories preserved in reconciliation commit:

`f0380e614087c8e1b05810ccd3e8d3acea583364`

Post-reconciliation compare proved:

- behind current main: 0
- changed files: exactly 7
- deletions: 0
- no inherited GER, RLIB, or MDO paths
- no old CE-004 `_021` migration path

This late migration collision and its repair invalidate the older exact-head acceptance as merge authority. The reconciled head and any subsequent documentation-only head must pass exact-head acceptance again before merge.

Production remains unchanged. No paid provider call was made. Merge remains separately authorized by Joseph and will execute only after the fresh acceptance gates pass.
