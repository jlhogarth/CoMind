# CFR-001E Governed Promotion and Pruning Contract

Date: 2026-10-25  
Parent: CFR-001 / Issue #176  
Work item: CFR-001E / Issue #181  
Pull request: #184  
Environment: Test only  
Supabase project: `sbgfuanxiqepcoboxzcl`  
Production changed: No  
Destructive pruning enabled: No

## Purpose

CFR-001E defines the proof contract that must pass before an exact range of raw conversational capture evidence can become eligible for a future destructive pruning operation.

This lane does not delete raw capture events, recovery checkpoints, promotion evaluations, prune manifests, canonical messages, or conversations. It does not add a pruning executor.

Governing rule:

`Capture first. Interpret second. Promote deliberately. Prune last.`

## Architectural finding

Before CFR-001E, the 36-hour minimum retention policy was bound to both raw capture events and recovery checkpoints. That was not destructive because no pruning executor existed, but it would be an unsafe future model: the evidence proving a raw source is safe to retire must not disappear under the same raw-source lifecycle.

CFR-001E therefore separates two retention concerns:

1. `conversation_raw_protected_36h` governs immutable raw capture events.
2. `conversation_continuity_evidence_retained` governs recovery checkpoints, promotion evaluations, and prune manifests independently of raw-source eligibility.

Both policies explicitly leave destructive pruning disabled.

## Implementation

### Immutable prune manifest

New table: `comind.cm_conversation_prune_manifest`

Each manifest binds an exact proposed source range to:

- conversation
- retention policy
- promotion evaluation
- recovery checkpoint
- first and last capture sequence
- contiguous event count
- SHA-256 digest of ordered source-event hashes
- latest capture time
- eligibility time
- durable destinations
- full eligibility snapshot
- manifest SHA-256
- creating actor

Canonical Test/Supabase foreign keys use `ON DELETE RESTRICT`. UPDATE and DELETE are rejected by the existing CFR append-only evidence trigger.

### Deterministic evaluator

New function:

`comind.cm_evaluate_conversation_prune_eligibility(uuid, timestamptz)`

The evaluator returns `eligible` plus explicit `hold_reasons`. It never deletes data.

It verifies:

- canonical retention policy exists and contains a valid minimum protected interval
- captured source evidence exists
- capture sequence range is contiguous
- the configured protected interval has expired for the requested evaluation time
- no assistant generation remains active
- a recovery checkpoint exists and covers the latest capture sequence
- the latest promotion evaluation is bound to the latest checkpoint
- `retain_raw` blocks eligibility
- `extend_protection` blocks through its deadline and does not automatically convert to eligibility afterward
- only `eligible_to_prune` can pass the promotion decision gate
- each interrupted assistant generation with deltas has an exact recovery checkpoint preserving its partial text

The returned contract also states `destructive_pruning_enabled=false`.

### Strict compatibility gate

The existing `cm_assert_conversation_prunable(uuid)` API is preserved as a strict wrapper over the stronger deterministic evaluator. It raises with explicit hold reasons instead of independently deciding eligibility.

### Governed manifest creation

New function:

`comind.cm_create_conversation_prune_manifest(uuid, text, timestamptz)`

The function:

- calls the deterministic evaluator
- refuses manifest creation while any hold reason exists
- creates one immutable manifest for an exact conversation/range/evaluation tuple
- is idempotent for repeated requests against the same tuple
- never deletes source evidence

A future pruning executor must be a separate authorized lane and must consume an already-governed eligible manifest rather than inventing eligibility itself.

## Private service boundary

Public client roles cannot access the pruning-governance surface.

Verified in Supabase Test:

- `anon`: no prune-manifest table privilege and no evaluator execution
- `authenticated`: no prune-manifest table privilege and no evaluator execution
- `service_role`: SELECT/INSERT manifest access plus evaluator and manifest-creator execution
- `service_role` has no UPDATE or DELETE privilege on prune manifests

Owner-level UPDATE and DELETE attempts are additionally rejected by the append-only CFR evidence trigger.

## Migrations

Repository migrations:

- `db/migrations/20261025_005_conversational_continuity_promotion_pruning_contract.sql`
- `db/migrations/20261025_006_conversational_continuity_promotion_pruning_hardening.sql`

Applied Supabase Test migrations:

- `20261025212440` `cfr_001e_governed_promotion_pruning_contract_v0_1`
- `20261025212804` `cfr_001e_governed_promotion_pruning_hardening_v0_1_1`

Migration 006 is intentionally forward-only. Migration 005 was not rewritten after deployment. The hardening migration adds the covering index for `cm_conversation_prune_manifest.evaluation_id` identified by the Supabase performance advisor.

## Local PostgreSQL parity

Local bootstrap additions:

- `db/sql/v2/14a_cfr_ci_evidence_compat.sql`
- `db/sql/v2/15_conversation_promotion_pruning.sql`
- `db/sql/v2/15a_conversation_pruning_ci_cleanup.sql`
- `db/sql/v2/16_conversation_promotion_pruning_hardening.sql`

The two `a` compatibility layers are isolated-CI exceptions only:

- local evidence rows remain update-immutable but can cascade-delete when a disposable test conversation is cleaned up
- local prune-manifest foreign keys cascade only so integration fixtures can delete themselves

Supabase Test remains stricter: manifest foreign keys use RESTRICT and the evidence trigger rejects both UPDATE and DELETE.

## Isolated PostgreSQL acceptance

`server/test/integration/conversation-pruning-contract.test.mjs` runs inside the existing conversation-lifecycle integration workflow.

It verifies:

1. protected-window hold before checkpoint/promotion evidence exists
2. active-generation hold even when later eligibility time is used
3. `retain_raw` hold
4. `extend_protection` hold
5. transition to `eligible_to_prune`
6. interrupted partial text blocks eligibility until an exact recovery checkpoint exists
7. checkpoint and promotion evaluation must match
8. source range is exactly contiguous
9. source SHA-256 is reproducible
10. manifest creation is idempotent
11. manifest UPDATE is rejected
12. raw-source and continuity-evidence policies have separate bindings
13. no destructive pruning capability is enabled

CI #608 passed the complete repository CI suite on the implementation head, including the new CFR-001E integration cases:

https://github.com/jlhogarth/CoMind/actions/runs/40235262804

## Live Test acceptance

Synthetic proof conversation:

- conversation: `e1810001-0000-4000-8000-000000000001`
- external reference: `cfr-001e-live-prune-contract-20261025`
- generation: `8941411e-ef03-456a-8d80-05aba887129f`
- checkpoint: `d05aead0-8c66-4874-9cac-65ea023df0c1`
- promotion evaluation: `e1d153f1-4ead-4ee5-aac3-ac981be8503d`
- manifest: `1d35d803-2262-4c61-aee2-3f642937064b`

The proof used the actual Test `service_role` and existing canonical CFR helper functions. No model/provider was called and the proof was non-cost-bearing.

### Interrupted source

The synthetic assistant streamed two deltas and then interrupted:

`Preserve this interrupted assistant text exactly.`

The recovery checkpoint preserves that exact partial content.

### Source range and manifest

Verified:

- first sequence: `1`
- last sequence: `5`
- event count: `5`
- checkpoint last capture sequence: `5`
- source digest: `e29a53d0c6b92ced855945a9c8f43a6cb6787b27634c58183b74b87da8a563cf`
- manifest SHA-256: `43eb0cb677051ef82ab1456f7fbe875bc4ed61e5afd1c93b26e40c26d92ef2bd`
- manifest durable destination: the recovery checkpoint preserving unfinished assistant text

### Time-based eligibility

At current capture time plus one hour:

- eligible: false
- hold includes `protected_window_active`

At latest capture time plus forty hours:

- eligible: true
- hold reasons: empty
- uncovered interrupted generation count: zero
- destructive pruning enabled: false

This proves the 36-hour threshold is read from the canonical policy while leaving the evidence chain intact.

### Idempotency and immutability

A repeated manifest-creation request returned the same manifest ID and total manifest count remained one.

Mutation protection was verified at two layers:

1. `service_role` UPDATE is denied by table privilege.
2. owner-level UPDATE and DELETE are rejected by the append-only evidence trigger.

## Reusable verification

Read-only verifier:

`db/verification/cfr_001e_promotion_pruning_contract.sql`

The verifier anchors time checks to the proof conversation's latest capture time, making the acceptance stable after the real 36-hour wall clock expires.

It returned `PASS` with all 18 checks true:

- ACL isolation
- raw retention binding
- conversation identity
- external reference
- source digest
- manifest range
- manifest digest
- non-destructive state
- exact partial content
- protected-window hold
- continuity-evidence bindings
- future eligibility
- promotion decision
- checkpoint coverage
- durable destination
- manifest idempotency
- interrupted generation status
- policy executor disabled

The first draft of the verifier used `bool_and(value)` against `jsonb_each_text()`, which returns text. PostgreSQL correctly rejected it. No data changed. The final reducer casts `value::boolean`, after which the verifier returned PASS. This correction is retained as evidence because verification logic itself is part of the trustworthy evidence path.

## Advisor hardening

The first post-DDL Supabase performance advisor identified one CFR-001E foreign key without a covering index:

`cm_conversation_prune_manifest_evaluation_id_fkey`

Migration 006 added:

`idx_cm_conversation_prune_manifest_evaluation`

The follow-up advisor pass no longer reports that CFR foreign key. The project-wide unindexed-FK count decreased from 110 to 109.

The new prune-manifest indexes are reported as unused immediately after creation, which is expected for a nearly empty Test table and is not evidence that the indexes are unnecessary.

Supabase advisor reference:

https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

The security advisor reported no new CFR function search-path warning. Existing project-wide security findings are outside this lane.

## Result

`PASS`

CFR-001E now provides a governed, auditable, non-destructive eligibility and manifest contract for future conversation pruning. Raw evidence cannot become eligible merely because time passed. Eligibility requires source integrity, checkpoint coverage, promotion governance, preservation of interrupted partial text, and an immutable manifest. Destructive pruning remains disabled and requires a separate future authorization and implementation lane.
