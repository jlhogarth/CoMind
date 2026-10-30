# GER-002 Persistence Contract Provenance

Date: 2026-10-30
Issue: #379
Environment: Test only
Production activation: false

## Starting authority

GER-002 began after GER-001 PR #386 merged and issue #378 closed.

Verified starting `main`:

`35e156dab1a586e4103a727b843ab8bba09530c3`

Branch created from that exact commit:

`ger-002-epistemic-case-persistence-contract`

No pre-existing GER-002 branch was found. No active `iic-007` or `iic-008` branch was found during collision review. IIC-007 issue #351 and IIC-008 issue #352 remain adjacent planned integrity work and are not implemented by GER-002.

RunBook work item:

`99e8b0fa-2f1b-485f-9e72-a40d3c75565b`

Initial RunBook event:

`11fb6b16-a189-4b54-976b-8efdf5d692a2`

## Recovered persistence baseline

The following existing substrates were inspected before schema design:

- `comind_development.entity`
- `comind_development.relationship`
- `comind_development.artifact`
- `comind_development.journal_entry`
- `comind.cm_evidence`
- `comind.cm_belief_state`
- `comind.cm_belief_update_log`
- ThreadKeeper persistence tables and repository code
- conversation promotion and history structures
- PM retention and data-governance tables
- GER-001 policy kernel and architecture

Disposition:

- `comind_development` remains the development-evidence substrate.
- `cm_evidence` remains evidence receipt/registry infrastructure.
- ThreadKeeper remains continuity-specific.
- legacy causal belief tables are not GER's runtime case store.
- PM retention/classification/hold governance is reused.
- GER receives a minimal dedicated runtime case lineage because no existing substrate owns that responsibility without collapsing boundaries.

## Test migrations applied

The connected Supabase Test project recorded these GER-002 migrations:

1. `20261030133633` `ger_002_epistemic_case_persistence_contract`
2. `20261030133740` `ger_002_epistemic_persistence_hardening`
3. `20261030133825` `ger_002_payload_validation_privilege_hardening`
4. `20261030134047` `ger_002_relationship_fk_index_hardening`

The migration history is mirrored in the repository rather than flattened, preserving the discovered hardening sequence.

## Physical persistence decision

Four immutable control-plane tables were created in Test:

- `comind.cm_epistemic_case`
- `comind.cm_epistemic_object`
- `comind.cm_epistemic_relationship`
- `comind.cm_epistemic_event`

Two security-invoker projections were created:

- `comind.v_epistemic_object_state`
- `comind.v_epistemic_case_status`

No second raw-evidence repository was created.

## Data governance registration

The four GER assets were registered in `comind_pm.pm_data_asset_governance` with:

- project scope `COMIND`
- classification `INTERNAL`
- retention profile `DURABLE-EVIDENCE`
- allowed purposes `governed-epistemic-reasoning`, `audit`, `recovery`
- legal hold false at registration
- evidence hold false at registration
- disposition active
- Production false metadata

This reuses the existing governance layer rather than creating GER-specific retention tables.

## Least-privilege proof

`comind_ger_runtime` was verified as:

- non-login
- non-superuser
- no database creation
- no role creation
- no inherited privileges
- no replication
- no RLS bypass

Verified runtime capabilities:

- schema usage: true
- case SELECT: true
- case INSERT: true
- case UPDATE: false
- case DELETE: false
- event SELECT: true
- event INSERT: true
- event UPDATE: false
- event DELETE: false

RLS is enabled on all four GER tables.

In the connected Supabase environment, `service_role` has no direct GER table SELECT but can explicitly `SET` the constrained GER role.

## Live rollback proof

A synthetic Test transaction under `comind_ger_runtime` proved:

- case creation
- root event creation
- claim creation
- canonical evidence pointer creation
- novel connection candidate creation
- support relationship creation
- object recording events
- legal state transitions
- current-state projection
- stale-state rejection
- connection-candidate direct-conclusion rejection
- event-lineage fork rejection
- runtime UPDATE denial
- duplicate event-key rejection
- evidence-backed conclusion
- evidence-backed reopening
- append-only owner-path enforcement
- final case projection `reopened`

The transaction was rolled back.

Residual synthetic case rows after proof: `0`.

## Failure discovered during proof: payload validator privilege

The first constrained-role insert attempt failed with permission denied on `cm_ger_payload_has_forbidden_key`.

Cause:

The first migration correctly revoked PUBLIC execution on the recursive payload validator, but the CHECK constraints execute that function during INSERT and the constrained GER runtime role had not been granted EXECUTE.

Safety behavior:

The failure was closed by PostgreSQL before persistence. No partial test row survived.

Correction:

Migration `20261030133825` grants only EXECUTE on `comind.cm_ger_payload_has_forbidden_key(jsonb)` to `comind_ger_runtime`.

The proof was rerun successfully.

## Verification interpretation: runtime UPDATE

A later proof initially expected the append-only trigger error for an UPDATE executed under `comind_ger_runtime`.

PostgreSQL instead rejected the statement for insufficient privilege before the trigger could execute because the runtime role has no UPDATE privilege.

This was classified as the stronger intended boundary, not a defect.

The proof was separated into:

- runtime role: privilege-level UPDATE denial;
- database owner path: immutable-trigger UPDATE denial.

Both passed.

## Advisor delta

Security advisor after GER-002 retained the pre-existing repository findings and introduced no GER-specific warning:

- RLS-enabled tables without policies: 62, none GER
- mutable function search paths: 7, none GER
- anonymous executable security-definer warnings: 3, none GER
- authenticated executable security-definer warnings: 2, none GER

Performance advisor before relationship index hardening reported 165 unindexed foreign-key findings, including two GER same-case relationship constraints.

Migration `20261030134047` added covering composite indexes and removed the redundant single-column relationship indexes.

Post-hardening advisor result:

- unindexed foreign-key findings: 163
- GER-specific unindexed foreign keys: 0

New GER indexes are naturally reported as unused immediately after creation; this is not treated as a defect before workload history exists.

## Persistence semantics

GER-002 preserves these contracts:

- confidence is not evidence;
- confidence does not grant authority;
- source relevance does not establish truth;
- novel connections cannot silently become conclusions;
- contradicting and superseded artifacts remain reconstructable;
- evidence payload ownership stays with the source evidence system;
- objects and relationships are immutable;
- state changes are append-only events;
- event keys are idempotency identities bound to canonical digests;
- stale case heads and stale object states fail closed;
- case chronology cannot silently fork;
- reopening appends history rather than erasing the prior conclusion;
- private chain-of-thought is not a persistence requirement.

## Repository implementation

GER-002 adds a TypeScript persistence repository that uses:

- PostgreSQL serializable transactions;
- constrained role assumption;
- runtime privilege-shape verification;
- case-scoped advisory transaction locks;
- explicit expected-head optimistic concurrency;
- semantic replay digest checks;
- GER-001 application transition validation;
- database transition validation;
- transactional object/relationship plus chronology persistence;
- deterministic case snapshot reconstruction.

The dedicated CI workflow uses PostgreSQL 17 and applies the exact migration sequence before running migration verification, build, policy tests, and GER persistence integration tests.

## Freshness reconciliation

GER-002 started from GER-001 merge commit `35e156dab1a586e4103a727b843ab8bba09530c3`.

While the lane was active, CE-004 merged to `main` at `c3cc95cae33a2476027ce90639d4f473781f787b`. The CE-004 and GER-002 changed-file sets were compared and found to be disjoint. GER-002 was reconciled with that exact `main` lineage in merge commit `4e26b3064720afa83196669cb88dbeaac8de30dc`. The resulting branch was 0 commits behind and changed exactly 10 GER files relative to that fresh base.

During PR validation, HAI-007 then advanced `main` again to `4a7beacc8fc92a7b7e2d75dbadb202ed767509db`. The intervening `main` changes consisted of two added documentation files:

- `docs/governance/VE-ENGINEERING-STANDARD-v0.1.md`
- `docs/research/HAI-007-literature-grounding-canonical-reconciliation.md`

Those files were disjoint from GER-002. GER-002 was reconciled again, producing merge commit `a7228b57eba629dc2ec2a106a40f8ff324245d2e`. At that point the branch was 0 commits behind current `main` and still changed exactly the same 10 GER-002 files.

## PR validation failure and recovery

PR #394 was opened for GER-002.

The first dedicated GER exact-head PostgreSQL 17 workflow passed on candidate `4e26b3064720afa83196669cb88dbeaac8de30dc` in run `41066549289`.

The wider repository matrix nevertheless exposed two integration defects:

1. `server/test/ger-persistence.integration.test.mjs` originally activated whenever `DATABASE_URL` existed. Unrelated Foundry workflows use isolated PostgreSQL databases and therefore unintentionally ran the GER integration suite without applying GER migrations.
2. The dedicated GER workflow changed directories with `cd server` and then invoked literal paths such as `test/ger.test.mjs`. NDT-001 resolves literal workflow paths from the repository root when no workflow `working-directory` is declared and correctly classified those paths as dead-path risks.

The affected first-pass workflows included:

- Foundry Runtime Orchestration, run `41066549135`
- Foundry Test one-shot local handoff, run `41066548987`
- Foundry Terminal Lifecycle, run `41066548928`
- Implementation Integrity, run `41066548940`

Repairs:

- GER persistence integration tests now require both `DATABASE_URL` and `GER_PERSISTENCE_INTEGRATION=1`.
- The explicit GER integration flag is set only in the dedicated GER workflow step.
- Server workflow steps now use `working-directory: server`, satisfying both execution semantics and NDT-001 static path resolution.

On the HAI-reconciled candidate `a7228b57eba629dc2ec2a106a40f8ff324245d2e`, the repaired controls were independently confirmed by successful exact-head runs including:

- Implementation Integrity `41067389164`
- Foundry Terminal Lifecycle `41067389288`
- Foundry Runtime Orchestration `41067388998`
- GER-002 Epistemic Persistence `41067388987`

This demonstrates both that the dedicated GER persistence proof still runs and that unrelated database-backed suites no longer activate it accidentally.

## RunBook evidence recovery

A RunBook recovery event was intentionally used to preserve the first PR matrix failure and its repair.

Two initial evidence-write assumptions were rejected safely by the live RunBook schema:

1. `event_type='failure'` was rejected by `pm_events_event_type_check`.
2. `event_type='recovery'` with `outcome='recovered'` was rejected by `pm_events_outcome_check`.

Both statements were atomic and rolled back. The canonical constraint vocabulary was then read directly. The successful record used `event_type='recovery'` and `outcome='partial'`.

Successful RunBook recovery event:

`c7fc41bb-babc-4cc1-8d14-03ac796e80f7`

## Explicit boundary

GER-002 has not:

- activated Production;
- changed Agent or VE authority;
- changed Digital Twin promotion policy;
- implemented Console UI;
- migrated legacy ILP, decision-tree, or belief-state data;
- duplicated ThreadKeeper;
- implemented IIC-007 or IIC-008;
- created a second raw-evidence store;
- added destructive retention or deletion behavior.
