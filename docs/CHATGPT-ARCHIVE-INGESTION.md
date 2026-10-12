# ChatGPT Archive Ingestion and Integrity Handshake

## Evidence state

This lane is repository implementation with isolated PostgreSQL verification when its dedicated workflow passes on the exact pull-request head. It is not a live Supabase deployment and is not yet evidence that a real ChatGPT export has passed the integrity handshake.

A real export is accepted only after its own import receipt reaches `PASS` or an explicitly reviewed `WARN`. A `FAIL`, parser exception, incomplete attempt, or unresolved quarantine record is not accepted as trusted cognition input.

## Purpose

The archive ingestion subsystem preserves ChatGPT history as source evidence before CoMind derives memories, embeddings, summaries, decisions, entities, or other cognition artifacts from it.

Raw source evidence and derived CoMind knowledge are different layers. Derived knowledge never replaces the source evidence that justified it.

## Required invariants

The V0 integrity handshake checks that:

- every source conversation is accounted for
- every parseable message is accounted for
- raw timestamps are preserved and normalized timestamps are recorded separately
- source roles are preserved
- mapping nodes, parent links, child links, and branches are preserved where present
- exported files are inventoried with SHA-256 and byte length
- attachment references discovered in message structures are retained
- source conversation, node, and message identifiers are retained
- archive, file, conversation, node, normalized message, topology, event, and receipt hashes are recorded where applicable
- duplicate source message identities fail closed
- parser errors are explicitly recorded
- malformed evidence is quarantined instead of silently dropped
- finalized evidence is immutable
- repeated ingestion of the exact archive under the same parser and schema version reuses the finalized attempt instead of duplicating it

No source record may disappear silently during ingestion.

## Data layers

### Immutable archive source

`comind.cm_archive_source` identifies one observed archive by source system and SHA-256. For an extracted directory used during testing, a deterministic manifest hash is used as the source identity.

`comind.cm_archive_source_file` inventories every exported file by path, byte length, SHA-256, role, and media type where known.

### Import attempt

`comind.cm_archive_import` records one parser/schema attempt against an immutable source archive. The attempt begins as `PENDING` and may be finalized once as `PASS`, `WARN`, or `FAIL` with a hashed receipt.

A finalized import cannot be rewritten.

### Conversation and topology evidence

`comind.cm_archive_conversation_observation` stores the complete raw conversation JSON together with source identifiers, raw timestamps, normalized timestamps, source hash, normalized hash, topology hash, node count, message count, and attachment-reference count.

`comind.cm_archive_node_observation` stores every valid ChatGPT mapping node, including structural nodes whose `message` is null. This prevents branch topology from being flattened merely because a node does not contain a message.

### Attachments and files

Physical exported files are inventoried independently in `cm_archive_source_file`. Message-level file and attachment identifiers discovered in known message structures are stored in `cm_archive_attachment_reference`.

A physical file inventory and a message reference inventory are intentionally distinct because an export may contain unreferenced files, references whose physical file is unavailable, or future source formats not yet recognized by the semantic parser.

### Parser events and quarantine

`comind.cm_archive_parser_event` records warnings and errors as immutable evidence.

`comind.cm_archive_quarantine` preserves the complete raw JSON fragment when a conversation or source fragment cannot enter the normalized observation tables. Quarantine prevents parser limitations from becoming data loss.

## Hierarchical integrity evidence

The subsystem uses multiple integrity layers rather than treating the ZIP hash as proof of a correct import.

1. Archive identity: SHA-256 of the ZIP, or deterministic file-manifest identity for an extracted directory.
2. File identity: SHA-256 and byte length for every source file.
3. Conversation identity: SHA-256 of canonical raw conversation JSON.
4. Node identity: SHA-256 of canonical raw mapping-node JSON.
5. Normalized message identity: SHA-256 of selected normalized message semantics while raw JSON remains preserved.
6. Topology identity: SHA-256 of canonical node, parent, child, and message relationships.
7. Import receipt: SHA-256 of the final reconciliation receipt.

The topology hash means equal message counts cannot hide a changed branch graph.

## PASS, WARN, and FAIL

`PASS` requires source and database reconciliation to succeed and no parser errors or warnings to remain.

`WARN` requires source and database counts to reconcile, no parser errors, and one or more explicit parser warnings. Raw evidence remains available for review.

`FAIL` results when reconciliation counts do not match or any parser error is recorded.

A process-level interruption can leave an attempt `PENDING`. V0 deliberately does not pretend a partially persisted attempt is complete. Resume semantics are a later hardening item; a partial attempt must be investigated before reuse.

## Large export handling

Conversation files whose top-level value is a JSON array are read incrementally. The importer tracks JSON string escaping and object/array nesting and yields one top-level conversation object at a time. It does not require an entire large `conversations.json` array to fit in memory.

The importer accepts:

- an extracted ChatGPT export directory
- a ChatGPT export ZIP when the host has the `unzip` command

The CoMind devcontainer and dedicated CI workflow install `unzip`.

## CLI

After applying the archive migrations and building the server:

```bash
cd server
npm run build
DATABASE_URL=postgresql://... node dist/archive/chatgpt-export-cli.js /path/to/export.zip
```

The CLI prints the final import identifier, archive identifier, status, receipt, and receipt SHA-256. Exit code `2` indicates a completed `FAIL` handshake. Process-level failures use exit code `1`.

Do not point development verification at a live database.

## Isolated verification

Use only a disposable local PostgreSQL database named `comind_ci`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comind_ci \
  bash scripts/test_chatgpt_archive_ingestion.sh
```

The script refuses other database names and nonlocal hosts. It applies the migrations twice to verify idempotency, verifies immutability and finalization constraints, builds the server, runs parser tests, and runs an end-to-end PostgreSQL ingestion fixture.

## Real export acceptance sequence

1. Keep the original completed export ZIP unchanged.
2. Record its file name, byte length, and SHA-256 through the importer.
3. Run the import against an authorized CoMind database environment.
4. Review the final receipt.
5. Require conversation, message, node, and asset reconciliation.
6. Review every warning, error, and quarantine record.
7. Treat the export as trusted source evidence only after acceptance.
8. Preserve the original ZIP independently of the normalized database representation.

Embeddings, RAG indexing, memory extraction, summarization, and semantic classification are downstream work and do not block source preservation.

## Point-in-time differential milestone

Point-in-time comparison is intentionally sequenced after one baseline export has passed the full handshake.

When a second full export exists, compare two independently preserved import observations and classify at minimum:

- unchanged conversations and messages
- new conversations and messages
- changed or versioned observations
- structural topology changes
- newly inventoried attachments or files
- observations present at the baseline but absent later
- parser/schema anomalies

Absence from a later export is an observation, not proof of deletion. CoMind preserves both point-in-time observations and their provenance.

`comind.cm_archive_diff_receipt` reserves the durable receipt boundary for this future comparison. The diff implementation must not run until the baseline import is accepted.

## Production gates still open

This V0 does not establish production readiness. Remaining gates include:

- exact-head CI acceptance on the implementation PR
- review against a real ChatGPT export schema from the user's completed export
- authorized Supabase deployment plan and RLS/privilege design
- durable raw ZIP storage location and retention policy
- resume/recovery behavior for interrupted `PENDING` imports
- performance evidence using a realistically sized export
- point-in-time diff implementation and acceptance
- downstream search, RAG, and governed memory derivation
