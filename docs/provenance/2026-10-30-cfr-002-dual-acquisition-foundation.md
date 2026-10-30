# CFR-002 Dual-Acquisition Foundation Provenance

Date: 2026-10-30
Issue: #387
PR: #388
Environment: repository and isolated synthetic PostgreSQL/Node acceptance only
Production changed: no
Private ChatGPT/browser capture performed: no
Paid provider/model call performed: no

## Purpose

Establish the first durable implementation slice of CFR-002, the CoMind Native Conversation Interface, without creating a competing transcript model or depending on one undocumented ChatGPT endpoint shape.

The slice creates a source-neutral acquisition contract for two independently observed live source families:

- `openai_api`
- `chatgpt_browser_observed`

The browser-observed family is an architectural boundary and synthetic test source in this slice. Live authenticated browser observation remains separately governable and is not activated here.

## Existing substrate reused

CFR-002 extends rather than replaces:

- `comind.cm_conversation`
- `comind.cm_message`
- `comind.cm_conversation_capture_event`
- `comind.cm_assistant_generation`
- `comind.cm_conversation_recovery_checkpoint`
- CFR-001F native ChatGPT archive/live reconciliation
- CFR-001G derived analytics and promotion-candidate boundaries
- CHIST lossless archive ingestion and certified history baseline

The active HCH-001 lane was initially found to be changing `server/src/conversation-db.ts` and migration numbers through `20261030_022`. CFR-002 therefore remained additive and did not modify `server/src/conversation-db.ts`.

A later freshness check found that current `main` had advanced and now owned migration numbers `20261030_023`, `20261030_024`, and `20261030_025`. CFR-002 was therefore renumbered to `20261030_026` before reconciliation with current `main`. The earlier `_023` CFR path was removed from the branch and was never merged to `main`.

## External contract verification

Official OpenAI Responses streaming documentation was checked on 2026-10-30 before encoding supported event names.

Source:

- https://developers.openai.com/api/reference/resources/responses/streaming-events

Verified event families relevant to this slice include:

- `response.created`
- `response.output_text.delta`
- `response.output_text.done`
- `response.reasoning_summary_text.delta`
- `response.reasoning_summary_text.done`
- `response.completed`
- `response.incomplete`
- `response.failed`
- `error`

The API reference also lists `response.reasoning_text.delta` and `.done`. CFR-002 deliberately does not normalize those events into CoMind reasoning evidence. The first slice only promotes explicitly exposed reasoning-summary events into the `reasoning_summary_*` normalization classes. This preserves the architectural boundary that CoMind must not relabel provider-internal or otherwise non-approved reasoning material as raw hidden chain of thought.

## Data model introduced

Migration:

`db/migrations/20261030_026_cfr_002_dual_acquisition_foundation.sql`

### `cm_conversation_acquisition_observation`

Immutable arrival ledger containing source identity, local acquisition order, source sequence when available, endpoint family, source timestamp, raw-envelope SHA-256, byte count, optional out-of-row raw object reference, and non-payload acquisition metadata.

An early draft made `(source_family, source_stream_ref, source_event_ref)` unique. That was rejected before acceptance because it would erase evidence of duplicate/replayed arrivals. The accepted design assigns every arrival its own generated `acquisition_sequence`; source identity is indexed but not unique. The sequence is backed by the explicitly named short sequence `comind.cm_conv_acq_seq` so grants and replay are not dependent on PostgreSQL's implicit identifier generation or truncation.

### `cm_conversation_acquisition_normalization`

Immutable versioned normalization outcome. Status vocabulary includes:

- `normalized`
- `normalization_failed`
- `schema_drift`
- `duplicate`
- `out_of_order`
- `unknown`

Duplicate and out-of-order classifications can link to the related earlier observation. Normalized events may link to the existing canonical CFR capture ledger rather than creating a second transcript.

### `cm_conversation_acquisition_reconciliation`

Immutable deterministic comparison receipt for two independently observed live streams. Result vocabulary:

- `exact`
- `compatible_extension`
- `conflict`
- `ambiguous`
- `unmatched`

Reconciliation preserves both sources and never overwrites either observation stream.

## Authority and access boundary

A dedicated role is created:

`comind_conversation_acquisition_writer`

Required posture:

- NOLOGIN
- NOINHERIT
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS

All three CFR-002 evidence tables use forced RLS. The acquisition authority receives SELECT and INSERT only. UPDATE and DELETE are denied, and owner-level mutation attempts are also rejected by immutable-evidence triggers.

No public Data API grant is introduced.

## Runtime normalizer and comparison contract

`server/src/conversation-acquisition.ts` provides deterministic, provider-independent functions for:

- stable JSON canonicalization
- SHA-256 raw-envelope identity
- supported API event normalization
- browser-adapter event normalization
- sequence classification
- deterministic semantic comparison

Unknown or malformed source shapes remain `unknown` or `schema_drift`; meaning is not guessed.

The browser adapter boundary intentionally does not encode the concrete private `/backend-api/*` transport shape. A later separately authorized adapter can transform a captured raw browser/network event into this stable acquisition contract while preserving the raw envelope digest/object reference for parser drift and differential analysis.

## Synthetic acceptance cases

Node tests cover:

- key-order-independent raw-envelope digests
- API/browser semantic normalization parity
- reasoning-summary capture versus non-normalization of reasoning-text events
- missing/retyped field drift
- unknown browser event families
- in-order, duplicate, out-of-order, gap, and indeterminate source sequences
- exact dual-source agreement
- compatible extension from additional reasoning evidence
- compatible extension from a later matching completion
- material transcript conflict
- ambiguity
- unmatched logical turns

PostgreSQL verification covers:

- dedicated role posture
- forced RLS
- SELECT/INSERT-only authority
- five immutable synthetic observations
- two preserved arrivals carrying the same API event identity and raw digest
- explicit duplicate normalization
- explicit out-of-order normalization
- explicit schema-drift normalization
- one dual-source reconciliation receipt
- immutable evidence rejection on mutation attempt

## Acceptance runner

`scripts/test_cfr_002_dual_acquisition.sh`

The runner refuses non-local databases, reconstructs the accepted v2 substrate into isolated `comind_ci`, applies the CFR-002 migration twice to prove replay safety, executes PostgreSQL evidence verification, builds the server TypeScript, and runs the CFR-002 deterministic unit suite.

Dedicated workflow:

`.github/workflows/cfr-002-dual-acquisition.yml`

The workflow uses PostgreSQL 17 and Node 24 and requires no private data or provider call.

## Failure and repair evidence

The first exact-head dedicated run, GitHub Actions run `41063870395`, reached the CFR-002 migration after the accepted v2 substrate reconstructed successfully. The migration then failed while granting sequence privileges.

The original table used `acquisition_sequence bigint GENERATED ALWAYS AS IDENTITY`. The migration attempted to grant against the expected generated sequence name `cm_conversation_acquisition_observation_acquisition_sequence_seq`. PostgreSQL truncated the identifier to 63 bytes, but the actual implicit identity sequence did not have that assumed truncated name. The grant therefore failed with `relation does not exist`.

This was a migration portability defect, not a reason to weaken the least-privilege requirement. The repair replaces the implicit identity sequence with the explicit short sequence `comind.cm_conv_acq_seq`, uses it as the column default, binds it to the acquisition column with `OWNED BY`, and grants only the required sequence privileges to `comind_conversation_acquisition_writer`.

The failed run is retained as evidence because it demonstrates that the acceptance gate caught an assumption about generated PostgreSQL identifiers before any live deployment.

A subsequent freshness check found a separate namespace collision after other accepted lanes advanced `main`: `20261030_023_rlib_002_governed_drive_intake.sql`, `20261030_024_mdo_003_plan_scoped_claim_hardening.sql`, and `20261030_025_ce_004_friction_failure_register.sql` were present on current `main`. CFR-002 therefore moved to migration `_026` before branch reconciliation. This recovery preserves the one-migration-number ownership rule and prevents a stale branch from introducing a duplicate chronological migration identifier.

## Deliberate non-goals in this slice

- no live private ChatGPT browser interception
- no session-cookie or credential provisioning
- no production deployment
- no provider observer wiring yet
- no CoMind Chat UI yet
- no destructive pruning
- no automatic canonical memory, Rulebook, decision, architecture, or task promotion
- no raw hidden chain-of-thought claim

## Next implementation boundary

After the source-neutral foundation passes exact-head acceptance, the next child slice should wire supported OpenAI Responses events into the acquisition ledger, including exposed reasoning-summary events and lifecycle events, before enabling any live browser-observation adapter. This sequencing gives the later browser path a stable target and an independent supported-source comparator from its first live test.
