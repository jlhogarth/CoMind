# CFR-001F Native ChatGPT Archive and Live-Capture Reconciliation

Date: 2026-10-25  
Parent: CFR-001 / Issue #176  
Work item: CFR-001F / Issue #189  
Pull request: #192  
Environment: Test only  
Supabase project: `sbgfuanxiqepcoboxzcl`  
Production changed: No  
Destructive pruning enabled: No

## In this document

- [Purpose](#purpose)
- [Governing evidence model](#governing-evidence-model)
- [Current OpenAI evidence boundary](#current-openai-evidence-boundary)
- [Archive substrate activation](#archive-substrate-activation)
- [Reconciliation implementation](#reconciliation-implementation)
- [Matching hierarchy](#matching-hierarchy)
- [Interrupted-turn treatment](#interrupted-turn-treatment)
- [Authority and security boundary](#authority-and-security-boundary)
- [Isolated PostgreSQL acceptance](#isolated-postgresql-acceptance)
- [Supabase Test acceptance](#supabase-test-acceptance)
- [Advisor hardening](#advisor-hardening)
- [Failure and workaround evidence](#failure-and-workaround-evidence)
- [Result](#result)
- [Related artifacts](#related-artifacts)

## Purpose

CFR-001F creates the governed bridge between two independently preserved sources of conversational evidence:

1. CoMind live CFR capture, including canonical messages, immutable capture events, assistant-generation lifecycle evidence, and recovery checkpoints.
2. Native ChatGPT archive observations, including immutable source archives, mapping topology, message and node identifiers, parser evidence, quarantine, and archive hashes.

The reconciliation layer does not rewrite either source. It creates immutable receipts describing how one retrospective archive observation relates to a point-in-time snapshot of live CFR evidence.

Governing principle:

`Two observations of the same conversation are evidence to reconcile, not records to overwrite.`

## Governing evidence model

CFR-001F recognizes these top-level results:

- `exact_match`
- `compatible_extension`
- `conflicting_observation`
- `ambiguous_match`
- `unmatched_archive`

Candidate matching methods are:

- `explicit_source_id`
- `ordered_message_fingerprint`
- `weak_correlation`
- `none`

Weak title/time correlation may create a candidate but can never establish identity by itself. Ambiguity fails closed with no selected live conversation.

The reconciliation receipt preserves:

- archive import and source-conversation identity
- archive normalized hash
- full archive topology hash
- exact live snapshot cutoff
- deterministic live candidate-set digest
- selected live conversation when governance permits selection
- matching method
- message and candidate classification counts
- conflicts and unresolved evidence
- immutable receipt digest

## Current OpenAI evidence boundary

Official OpenAI documentation was checked before implementation and written through to the evidence system under research session:

`CFR-001F-OPENAI-EXPORT-2026-10-25`

Sources:

- https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data
- https://help.openai.com/en/articles/9106926-transfer-exported-conversations-between-chatgpt-accounts
- https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt
- https://help.openai.com/en/articles/10056348-finding-your-chats-projects-and-files-in-chatgpt

Findings used by CFR-001F:

- ChatGPT export is retrospective and requested by the user.
- OpenAI states export delivery can take up to seven days.
- Exported-conversation workflows document `conversations.json` or numbered conversation JSON files for larger exports.
- Deleted chats are not recoverable through export or search.
- No supported near-real-time personal ChatGPT conversation-history API was found in the official sources checked. This is a documentation-search finding, not a claim that no undocumented mechanism exists.

Architectural consequence:

Native ChatGPT archive ingestion is a retrospective reconciliation path. CoMind-owned live capture remains the protection against interrupted or uncommitted conversational work.

## Archive substrate activation

The existing ChatGPT Archive Ingestion subsystem from PR #109 had previously been repository-verified but was not deployed in Supabase Test.

CFR-001F activated the accepted archive package in Test only before adding reconciliation:

- `chatgpt_archive_ingestion_v1_test_activation`
- `chatgpt_archive_quarantine_v1_test_activation`
- `chatgpt_archive_access_hardening_v1_test_activation`

No private user archive was uploaded.

No archive login credential was provisioned.

Live Test verification confirmed:

- required archive tables exist
- archive evidence is immutable
- unparsed fragments can be quarantined without loss
- import attempts finalize once
- finalized imports reject later mutation
- all nine archive tables use forced RLS
- `anon`, `authenticated`, and `service_role` have no archive-table access
- `comind_archive_ingestor` is NOLOGIN and least privilege
- the ingestor can read/append archive evidence and finalize only the import header
- the ingestor has no destructive archive privileges

## Reconciliation implementation

Repository migrations:

- `db/migrations/20261025_007_native_chatgpt_live_reconciliation.sql`
- `db/migrations/20261025_008_native_chatgpt_live_reconciliation_live_read_boundary.sql`
- `db/migrations/20261025_009_native_chatgpt_live_reconciliation_ambiguity_hardening.sql`
- `db/migrations/20261025_010_native_chatgpt_live_reconciliation_snapshot_identity.sql`
- `db/migrations/20261025_011_native_chatgpt_live_reconciliation_policy_hardening.sql`

Primary implementation artifacts:

- `server/src/archive/chatgpt-live-reconcile.ts`
- `server/src/archive/chatgpt-live-reconcile-store.ts`
- `server/src/archive/chatgpt-live-reconcile-cli.ts`
- `server/src/archive/reconciliation-db.ts`
- `server/test/chatgpt-live-reconciliation.test.mjs`
- `scripts/test_cfr_001f_reconciliation.sh`
- `scripts/test_cfr_001f_classifications.sh`
- `.github/workflows/cfr-001f-reconciliation.yml`

Durable database evidence:

- `comind.cm_conversation_reconciliation_receipt`
- `comind.cm_conversation_reconciliation_candidate`

Both reconciliation tables are immutable and use forced RLS.

A reconciliation transaction runs at repeatable-read isolation. Receipt creation and candidate rows are atomic. Repeated reconciliation of the same immutable input identity may reuse an existing receipt only when its digest also matches.

The live snapshot cutoff is part of the immutable receipt identity so independently reproducible point-in-time reconciliations do not collapse merely because the candidate-set digest happens to match.

## Matching hierarchy

### Tier A: explicit native source identity

A live conversation may establish direct identity only when provenance explicitly carries the native ChatGPT source conversation ID, for example through a source-aware `external_ref` or dedicated metadata.

OpenAI API response IDs are not treated as native ChatGPT conversation IDs.

### Tier B: ordered multi-message fingerprint

When explicit source identity is unavailable, the classifier may select one unique candidate using deterministic ordered role/content fingerprints with compatible timing evidence.

At least two matching messages are required for this automatic fingerprint path.

### Tier C: weak correlation

Title and timestamp similarity may create a weak candidate, but weak correlation cannot establish identity. The result remains `ambiguous_match` and requires governed review.

## Interrupted-turn treatment

CFR-001F preserves interrupted live assistant evidence separately from canonical completed messages.

Two cases are distinguished:

1. `later_archive_completion`: the later archive contains an assistant message that begins with the live partial content. This is recorded as a later compatible observation, not as a retroactive rewrite of the interrupted generation.
2. `live_only_interrupted_partial`: the live partial is absent from the archive. The live evidence remains preserved and prevents an otherwise matching canonical transcript from being labeled `exact_match`.

The second rule directly addresses the failure class observed during development on 2026-10-25: a native ChatGPT request may time out or stop without committing the full assistant response visible to the user.

## Authority and security boundary

CFR-001F introduces:

`comind_conversation_reconciler`

The role is:

- NOLOGIN
- NOINHERIT
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS

The worker-login pattern is separate and fail closed:

- `COMIND_DATABASE_PURPOSE=chatgpt_reconciliation` is mandatory
- `CHATGPT_RECONCILIATION_DATABASE_URL` is mandatory
- ordinary `DATABASE_URL` is never a fallback
- login begins with no pre-assumed database role
- login must have exactly one direct membership
- membership must be SET-only access to `comind_conversation_reconciler`
- source reads occur only after `SET ROLE`
- preflight exercises actual RLS-protected reads before reconciliation is allowed

The reconciliation role has:

- SELECT-only source access across required live CFR and archive evidence
- SELECT/INSERT only on reconciliation receipts and candidate evidence
- no source INSERT, UPDATE, or DELETE
- no reconciliation UPDATE or DELETE
- no direct execution of immutable-evidence trigger helpers

`anon`, `authenticated`, `service_role`, and `comind_archive_ingestor` have no reconciliation-table access.

## Isolated PostgreSQL acceptance

Dedicated workflow:

`CFR-001F Reconciliation`

### Governed exact-path checkpoint

Run #17:

https://github.com/jlhogarth/CoMind/actions/runs/40240391154

It verified:

- constrained worker login
- SET-only role assumption
- RLS source reads
- deterministic exact classification
- immutable receipt/candidate persistence
- identical second run reuses the same receipt
- source evidence remains unchanged

### Full six-classification matrix

Run #20:

https://github.com/jlhogarth/CoMind/actions/runs/40240632298

It verified through the same governed PostgreSQL path:

- exact match
- compatible extension from later archive completion
- compatible extension from live-only interrupted partial evidence
- conflicting observation
- weak-correlation ambiguity
- unmatched archive

The pure classifier also has deterministic unit coverage for all of these cases.

### Policy-hardening acceptance

Run #23:

https://github.com/jlhogarth/CoMind/actions/runs/40241186673

It re-ran the full acceptance after migration 011:

- reconciler role NOINHERIT hardening
- role-specific live CFR policies only where RLS is actually enabled
- no inert policies on RLS-disabled live CFR tables
- full six-classification matrix still passes

## Supabase Test acceptance

Applied reconciliation migrations:

- `cfr_001f_native_chatgpt_live_reconciliation_v0_1`
- `cfr_001f_reconciler_live_read_boundary_v0_1_1`
- `cfr_001f_reconciliation_ambiguity_hardening_v0_1_2`
- `cfr_001f_reconciliation_snapshot_identity_v0_1_3`
- `cfr_001f_reconciliation_policy_hardening_v0_1_4`

Reusable Test verifier:

`db/verification/cfr_001f_native_chatgpt_live_test.sql`

The read-only verifier returned `PASS` with all 18 checks true.

Synthetic Test evidence:

### Exact retrospective confirmation

- live conversation: `f1010001-0000-4000-8000-000000000001`
- archive import: `f1010001-0000-4000-8000-000000000102`
- reconciliation receipt: `f1010001-0000-4000-8000-000000000201`
- result: `exact_match`
- match method: `explicit_source_id`

### Live-only interrupted extension

- live conversation: `f1020001-0000-4000-8000-000000000001`
- interrupted generation: `f1020001-0000-4000-8000-000000000021`
- recovery checkpoint: `f1020001-0000-4000-8000-000000000031`
- archive import: `f1020001-0000-4000-8000-000000000102`
- reconciliation receipt: `f1020001-0000-4000-8000-000000000201`
- result: `compatible_extension`
- `live_only_interrupted_partial = 1`

Exact preserved partial:

`This interrupted fragment exists only in live CFR evidence.`

SHA-256:

`a8a1b024ac0dbdfafbfa6175d74327b4f6b0d585c631ce0126925f8bf25e1ab2`

### Fail-closed ambiguity

- archive import: `f1030001-0000-4000-8000-000000000102`
- reconciliation receipt: `f1030001-0000-4000-8000-000000000201`
- result: `ambiguous_match`
- selected live conversation: none
- match method: `none`

Test source evidence remained intact after receipt creation and after owner-level mutation attempts against reconciliation evidence.

## Advisor hardening

### Security advisor

The first post-deployment security advisor pass found three CFR-001F errors:

`rls_policy_always_disabled`

They occurred because migration 008 created reconciler SELECT policies on three live CFR tables whose RLS is currently disabled in Test:

- `cm_assistant_generation`
- `cm_conversation_capture_event`
- `cm_conversation_recovery_checkpoint`

CFR-001F did not enable RLS on those tables because doing so could change existing runtime behavior outside this lane.

Forward migration 011 instead:

- keeps reconciler policies only where RLS is already enabled
- removes inert policies where RLS is disabled
- sets the NOLOGIN reconciler role to NOINHERIT

The follow-up security advisor no longer reports those CFR-001F errors.

Existing project-wide RLS and function-search-path findings remain outside this lane.

### Foreign-key/index review

Every CFR-001F foreign key has a covering leading index, including:

- archive diff baseline import
- archive diff comparison import
- reconciliation receipt archive composite key
- reconciliation receipt selected live conversation
- reconciliation candidate receipt key
- reconciliation candidate live conversation

CFR-001F therefore adds no unindexed foreign-key debt.

## Failure and workaround evidence

### Test proof crypto privilege denial

The first attempt to write synthetic reconciliation receipts in Supabase Test called `extensions.digest()` after assuming `comind_conversation_reconciler`.

PostgreSQL correctly rejected the call because the reconciliation role has no extension-schema authority.

The transaction rolled back completely. A follow-up count verified:

- zero live synthetic conversations
- zero synthetic archive sources
- zero reconciliation receipts

from the failed attempt.

Resolution:

Do not widen reconciliation authority. Precompute synthetic proof hashes outside the restricted role and let the reconciler write only the already-computed evidence values.

This preserved the intended least-privilege boundary.

### Preflight schema visibility denial

The first constrained-login preflight attempted `to_regclass('comind...')` before `SET ROLE`.

The NOINHERIT worker login correctly had no direct schema access, so PostgreSQL rejected the check.

Resolution:

Verify login attributes and SET-only membership first, then assume `comind_conversation_reconciler`, then perform schema/object/ACL/RLS checks.

No direct schema privilege was granted to the worker login.

## Result

`PASS`

CFR-001F now provides a governed, deterministic reconciliation path between retrospective native ChatGPT archive observations and live CFR evidence while preserving both source domains independently.

Most importantly for conversational continuity, a later archive cannot erase evidence that CoMind observed during an interrupted generation. A canonical transcript may match while live-only interrupted text remains an explicit compatible extension.

Production remains unchanged.

## Related artifacts

- Parent issue: https://github.com/jlhogarth/CoMind/issues/176
- CFR-001F issue: https://github.com/jlhogarth/CoMind/issues/189
- PR: https://github.com/jlhogarth/CoMind/pull/192
- Original archive ingestion PR: https://github.com/jlhogarth/CoMind/pull/109
- Governed exact-path run: https://github.com/jlhogarth/CoMind/actions/runs/40240391154
- Full classification run: https://github.com/jlhogarth/CoMind/actions/runs/40240632298
- Policy-hardening run: https://github.com/jlhogarth/CoMind/actions/runs/40241186673
