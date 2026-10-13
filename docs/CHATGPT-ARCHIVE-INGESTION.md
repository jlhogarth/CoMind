# ChatGPT Archive Ingestion and Integrity Handshake

## Evidence state

The Issue #108 archive foundation is repository implemented and isolated-PostgreSQL verified on accepted main. It is not yet a live Supabase deployment and is not evidence that a real ChatGPT export has passed the integrity handshake.

Issue #110 adds the live credential and operational entry-point hardening required before live deployment. That amendment remains subject to its own exact-head review and merge acceptance.

A real export is accepted only after its own import receipt reaches `PASS`, or after every item in an explicitly reviewed `WARN` is dispositioned. A `FAIL`, parser exception, incomplete `PENDING` attempt, or unresolved quarantine record is not accepted as trusted cognition input.

No source record may disappear silently during ingestion.

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

A process-level interruption can leave an attempt `PENDING`. V0 deliberately does not pretend a partially persisted attempt is complete. Partial evidence is retained and investigated instead of deleted.

## Large export handling

Conversation files whose top-level value is a JSON array are read incrementally. The importer tracks JSON string escaping and object/array nesting and yields one top-level conversation object at a time. It does not require an entire large `conversations.json` array to fit in memory.

The importer accepts:

- an extracted ChatGPT export directory
- a ChatGPT export ZIP when the host has the `unzip` command

The CoMind devcontainer and dedicated CI workflow install `unzip`.

## Archive database security boundary

ChatGPT archives contain private historical source evidence. The archive subsystem therefore has a stricter access boundary than ordinary application data.

Migration `20261012_003_chatgpt_archive_access_hardening.sql` establishes the repository contract:

- every archive table has Row Level Security enabled and forced
- `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no direct archive-table privileges
- no Data API policy is created for archive tables
- `comind_archive_ingestor` is a `NOLOGIN`, `NOBYPASSRLS`, non-superuser group role
- the archive role receives only schema usage plus the table and sequence privileges required for ingestion and reconciliation
- immutable evidence tables receive `SELECT` and `INSERT`, but no `UPDATE`, `DELETE`, or `TRUNCATE`
- `cm_archive_import` additionally receives `UPDATE` only because a `PENDING` attempt must be finalized once
- trigger helper functions are not callable application RPC surfaces

The isolated verification script models Supabase API roles in disposable PostgreSQL and proves their archive privileges are absent.

### Dedicated live login contract

The repository does not contain and must not contain a login password for archive ingestion.

Live ingestion uses a separately protected database login with only SET-only membership in `comind_archive_ingestor`. The login must be `NOINHERIT`, non-superuser, NOCREATEDB, NOCREATEROLE, NOREPLICATION, and NOBYPASSRLS.

PostgreSQL 17 membership must be granted with `INHERIT FALSE` and `SET TRUE`. The process then explicitly assumes `comind_archive_ingestor` after proving the session identity and membership shape.

The governed archive CLI requires `CHATGPT_ARCHIVE_DATABASE_URL`. It never falls back to `DATABASE_URL`.

The application-side archive pool is limited to one connection. Preflight proves the dedicated login identity, exact membership, explicit `SET ROLE`, and expected constrained privilege shape before import. A write-free `--preflight` mode is available for deployment verification.

A custom PostgreSQL role can still receive privileges granted to `PUBLIC`. `NOINHERIT` does not suppress those privileges. Live deployment therefore requires a separate effective-privilege review after the dedicated login is created.

The broader pre-existing CoMind RLS backlog remains outside this archive milestone unless a verified archive-specific dependency requires otherwise.

## Supported operational entry point

The only supported live ChatGPT archive import entry point is:

```bash
cd server
npm run build
CHATGPT_ARCHIVE_DATABASE_URL='postgresql://...' \
  node dist/archive/chatgpt-export-cli.js --preflight

CHATGPT_ARCHIVE_DATABASE_URL='postgresql://...' \
  node dist/archive/chatgpt-export-cli.js /path/to/export.zip
```

The live secret must come from a protected local secret facility or approved secret manager, not from source control or project documentation.

For nonlocal Supabase connections require encrypted transport, using `sslmode=require` at minimum. Prefer direct PostgreSQL connectivity for this session-state-dependent process. If the execution host is IPv4-only and the project does not provide a direct IPv4 endpoint, use the shared Supabase pooler in session mode on port 5432. Do not use transaction pooler mode for this importer because the process depends on session-level `SET ROLE` state.

The CLI prints the final import identifier, archive identifier, status, receipt, and receipt SHA-256. Exit code `2` indicates a completed `FAIL` handshake. Process-level failures use exit code `1`.

The historical `server/src/scripts/import_chatgpt_export.ts` projection script is retired. It intentionally performs no database writes and directs operators to the governed archive CLI.

## Isolated verification

Use only a disposable local PostgreSQL database named `comind_ci`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comind_ci \
  bash scripts/test_chatgpt_archive_ingestion.sh
```

The script refuses other database names and nonlocal hosts. It models the Supabase API roles, applies all archive migrations twice to verify idempotency, verifies immutability and finalization constraints, verifies forced RLS and least-privilege role boundaries, builds the server, and runs parser and end-to-end ingestion tests.

The isolated test login is `NOINHERIT` and receives `comind_archive_ingestor` with `INHERIT FALSE, SET TRUE`. The test also proves:

- the archive CLI rejects a missing `CHATGPT_ARCHIVE_DATABASE_URL` even when `DATABASE_URL` is present
- the write-free CLI preflight leaves archive evidence counts unchanged
- `session_user` remains the dedicated login
- `current_user` becomes `comind_archive_ingestor`
- PIT-0 still reconciles under the constrained session

## Live deployment runbook

The exact live sequencing, credential handling, readback checks, Security Advisor gates, PIT-A handshake, and failure handling are maintained in:

`docs/CHATGPT-ARCHIVE-LIVE-DEPLOYMENT.md`

Do not run `verify_20261012_003_chatgpt_archive_access_hardening.sql` unchanged against live Supabase. Its isolated verifier creates immutable synthetic security-fixture evidence. Live verification uses read-only catalog queries unless a separately designed rollback-only smoke is explicitly authorized.

## Real export acceptance sequence

1. Keep the original completed export ZIP unchanged.
2. Preserve an independent backup copy.
3. Record its file name, byte length, and SHA-256 without modifying it.
4. Run the write-free archive database preflight using the dedicated live credential.
5. Run the import against authorized CoMind Supabase using the governed archive CLI.
6. Review the final receipt independently of the CLI result.
7. Require conversation, message, node, topology, and asset reconciliation.
8. Review every warning, error, and quarantine record.
9. Treat the export as trusted source evidence only after acceptance.
10. Preserve the original ZIP independently of the normalized database representation.

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

Until superseded by later evidence, remaining gates include:

- exact-head acceptance and merge of Issue #110 live credential hardening
- separately authorized live Supabase migrations
- separately authorized dedicated archive-login provisioning
- live effective-privilege and RLS readback
- post-deployment Supabase Security Advisor review
- write-free live application preflight
- receipt and quarantine review against the user's untouched full export
- durable raw ZIP storage and retention decision
- operating evidence for interrupted `PENDING` recovery handling
- performance evidence using the real export
- PIT-B differential implementation only after PIT-A acceptance
- downstream search, RAG, and governed memory derivation
