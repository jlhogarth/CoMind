# CFR-001 Conversational Continuity Foundation

Date: 2026-10-25  
Issue: #176  
Branch: `cfr-001-conversational-continuity`  
Environment: Test only  
Supabase project: `CoMind` (`sbgfuanxiqepcoboxzcl`)  
Production changed: No

## Purpose

CFR-001 establishes the first CoMind-owned conversational continuity substrate. The design goal is that once CoMind has observed conversational information, an ordinary stream interruption, client disconnect, downstream analytics failure, summarization process, or later pruning operation must not silently destroy the only recoverable copy.

Governing sequence:

`Capture first -> interpret second -> promote deliberately -> prune last`

This work extends the existing `comind.cm_conversation`, `comind.cm_message`, analytics, attachment, retention, and ChatGPT archive-ingestion lineage. It does not create a competing canonical transcript model.

## Existing lineage reused

The live CoMind schema already contained:

- `comind.cm_conversation`
- `comind.cm_message`
- `comind.cm_message_attachment`
- `comind.cm_message_analytics`
- `comind.cm_conversation_analytics`
- `comind.cm_retention_policy`
- `comind.cm_retention_binding`
- `comind.cm_tool_call`

The repository also contained `db/migrations/20261012_001_chatgpt_archive_ingestion.sql`, which preserves immutable imported ChatGPT archive sources, conversation observations, mapping topology, message nodes, attachment references, parser events, hashes, and diff receipts.

CFR-001 treats archive ingestion and live capture as separate acquisition paths that can later be reconciled.

## Repository implementation

### Foundation

File: `db/migrations/20261025_001_conversational_continuity_foundation.sql`  
Commit: `f062922f64e7f9eafa52dcc9f9ab8017b64c5ba7`

Introduced:

- `comind.cm_assistant_generation`
- `comind.cm_conversation_capture_cursor`
- `comind.cm_conversation_capture_event`
- `comind.cm_conversation_recovery_checkpoint`
- `comind.cm_conversation_promotion_evaluation`
- `comind.v_conversation_recovery_state`
- append-only evidence guards
- controlled assistant-generation lifecycle guards
- user-message capture before inference
- assistant stream-delta capture
- completion, interruption, and failure terminalization
- recovery-checkpoint generation
- destructive-pruning eligibility gate
- 36-hour minimum protected raw-retention policy

Assistant generation states are:

- `active`
- `completed`
- `interrupted`
- `failed`

The immutable event ledger remains authoritative evidence. Assistant generation state is a controlled lifecycle projection over that evidence.

### Index hardening

File: `db/migrations/20261025_002_conversational_continuity_hardening.sql`  
Commit: `58166db199a7f71455aafbd67ec5f7589021c101`

Added covering indexes for CFR foreign keys identified by the Supabase performance advisor and made extension lookup explicit in the pruning gate.

### Private boundary

File: `db/migrations/20261025_003_conversational_continuity_private_boundary.sql`  
Commit: `239ccf9e806e644821d3a6dafaa43c2e972f063a`

PostgreSQL grants new functions `EXECUTE` to `PUBLIC` by default. Although `anon` and `authenticated` already lacked `USAGE` on the private `comind` schema, CFR removes this latent privilege explicitly.

Verified boundary:

- `anon`: no `comind` schema usage, no CFR function execute privilege, no CFR table privileges
- `authenticated`: no `comind` schema usage, no CFR function execute privilege, no CFR table privileges
- `service_role`: CFR function execute privilege retained

### Service-role execution boundary

File: `db/migrations/20261025_004_conversational_continuity_service_role.sql`  
Commit: `9209f54cc822b17e831fc4116609bfbe7fa2e2bd`

CFR functions intentionally use `SECURITY INVOKER`. The migration grants `service_role` only the table privileges necessary for the private capture lifecycle. It does not grant CFR access to `anon` or `authenticated`.

## Live Test migrations

The following migrations are recorded in `supabase_migrations.schema_migrations`:

1. `20261025193736` `cfr_001_conversational_continuity_foundation_v0_1`
2. `20261025193821` `cfr_001_conversational_continuity_hardening_v0_1_1`
3. `20261025194154` `cfr_001_conversational_continuity_private_boundary_v0_1_2`
4. `20261025194228` `cfr_001_conversational_continuity_service_role_v0_1_3`

All four migrations applied successfully to the Test project.

## Protected retention contract

Policy: `conversation_raw_protected_36h`

Rules:

- `minimum_protected_hours = 36`
- `requires_promotion_evaluation = true`
- `required_prune_decision = eligible_to_prune`
- `capture_first = true`
- `summary_is_not_source_evidence = true`

Bound objects:

- `comind.cm_conversation_capture_event`
- `comind.cm_conversation_recovery_checkpoint`

`comind.cm_assert_conversation_prunable()` does not delete data. It only proves that pruning prerequisites are satisfied. A conversation cannot be declared prunable while inside the protected window, while an assistant generation remains active, without an `eligible_to_prune` promotion evaluation, or while an explicit protection extension remains active.

## Interruption recovery acceptance proof

Verification artifact: `db/verification/cfr_001_interruption_recovery.sql`  
Commit: `2d8e454bd5f71b95b9960fefa45490c161bf6c39`

The committed script was executed against Test and returned `PASS`.

### Acceptance scenario

1. Register one synthetic conversation.
2. Persist one user message before assistant generation.
3. Start one assistant generation.
4. Append three assistant stream deltas independently.
5. Interrupt the generation before any canonical assistant message is created.
6. Create a recovery checkpoint from persisted evidence.
7. Reconstruct the partial assistant response.
8. Attempt to mutate captured raw evidence and require rejection.
9. Attempt to pass the pruning gate inside 36 hours and require rejection.

### Verified result

- generation status: `interrupted`
- canonical user messages: `1`
- canonical assistant messages: `0`
- immutable capture events: `6`
- capture sequence: contiguous `1..6`
- checkpoint last sequence: `6`
- last completed role: `user`
- reconstructed partial content exactly matched the streamed deltas
- checkpoint partial content exactly matched independent reconstruction
- direct captured-content mutation was rejected by the append-only guard
- destructive-pruning eligibility was rejected inside the protected retention window

Committed-script proof identifiers:

- conversation: `189e5534-4340-465d-8736-8eddfbf9a999`
- generation: `7047401d-54fd-474a-8850-832c18620103`
- checkpoint: `827ca764-ed4f-4dff-a3c4-cb1111824e9d`

Recovered partial content:

> The first part of this answer was safely captured before the simulated connection failed.

An earlier interactive proof produced the same result with checkpoint SHA-256:

`82814519d3ce91145237a4747f8c18c7a7c0f0d29089886a98278930dab8a855`

## Access-boundary acceptance proof

Verification artifact: `db/verification/cfr_001_access_boundary.sql`  
Commit: `c6f1e5e0d87c6c0b37044cadc17b18a448c1ce72`

The committed script was executed against Test and returned `PASS`.

It verifies:

- `anon` cannot execute the CFR capture API
- `authenticated` cannot execute the CFR capture API
- neither public client role has `USAGE` on the private `comind` schema
- `service_role` can execute the CFR capture API
- under the actual `service_role`, a synthetic user turn can be captured, an assistant generation can stream a delta, the generation can be interrupted, and the partial response can be reconstructed

One durable service-role proof observed:

- conversation: `ae66e075-5ed4-4be2-9863-47234b9636e7`
- generation: `89e674d0-a344-4563-9d35-6b744b99bf0c`
- terminal status: `interrupted`
- last capture sequence: `4`
- recovered partial: `Service-role capture works before interruption.`
- last completed role: `user`

## Advisor verification

Security and performance advisors were run after DDL changes.

### CFR findings

- no CFR mutable-search-path warning
- no CFR public-client exposure finding
- all six CFR foreign-key index findings identified after the first migration were corrected
- project-wide unindexed foreign-key findings decreased from `112` to `106`
- new CFR indexes appear as unused immediately after creation, which is expected in the nearly empty Test dataset

### Existing unrelated findings

The advisors continue to report pre-existing project-wide items, including tables with RLS enabled but no policy, unrelated functions with mutable search paths, many historical unindexed foreign keys, and unused indexes. CFR-001 did not modify those unrelated areas.

## Durable RunBook evidence

Work item:

- `CFR-001`
- id: `7747e622-d2c3-495c-84c8-fd307aaa686b`
- status: `in_progress`
- priority: `high`

Human authorization:

- event: `5b7d5d36-e19f-462a-bf20-b6dd37822333`
- authorization: `ca4ba3a6-4e7e-4372-9ea5-b71545d4c10b`
- decision: `granted`
- scope: CFR-001 Test implementation, schema/process creation, verification, repository artifacts, and evidence capture

Interruption acceptance evidence:

- event: `aaece090-99c4-45cd-bad7-9eb2c560bdab`
- verification: `2d1d15e1-84d2-44f9-aa36-9721aa9f58cf`
- outcome: `pass`

## Architectural conclusions

1. Raw conversational source evidence, canonical transcript messages, and derived cognition are separate representations.
2. A completed canonical assistant message is not required for recovery. Partial assistant stream evidence survives independently.
3. Summaries are downstream derivatives and are not evidence that raw source was preserved.
4. Live capture and post-hoc ChatGPT archive ingestion are separate acquisition paths.
5. CFR uses sequence-ordered immutable evidence so an interrupted assistant response can be reconstructed deterministically.
6. Retention expiry alone is insufficient for pruning. Promotion evaluation is also required.
7. The public client surface remains closed. Capture is a private service-side responsibility.

## What Phase 1 proves

For conversations carried through a CoMind-controlled service path, CoMind now has an implementable and verified database foundation that can preserve user input before inference, preserve assistant output incrementally during streaming, distinguish interrupted generations from completed messages, reconstruct partial output after interruption, and prevent premature raw-evidence pruning.

## What Phase 1 does not yet solve

Phase 1 does not make the native ChatGPT application lossless. If native ChatGPT never exposes an unfinished streamed turn, CFR cannot retroactively recover content it never observed.

Remaining CFR work includes:

- application gateway integration so real CoMind conversations call the capture API automatically
- stream batching and checkpoint cadence policy
- crash/restart client recovery UX
- promotion engine into RunBook, Rulebook, Memory Graph, decisions, tasks, requirements, and other governed stores
- pruning worker and storage-pressure policy
- ChatGPT archive reconciliation against live-capture records
- analytics and intent derivation
- native ChatGPT acquisition options that remain within supported interfaces

## Phase 1 result

`PASS`

The exact failure class that motivated CFR-001 has been reproduced and recovered in the Test database. The next engineering boundary is no longer the database model. It is wiring a real CoMind conversational gateway into this capture lifecycle so the database observes the stream before a third-party conversational surface can lose it.
