# Conversation History Architecture Rules

Status: LOCKED architecture decision  
Decision date: 2026-10-26  
Scope: CHIST-001 and all future CoMind conversation-history ingestion, reconciliation, derivation, retrieval, and point-in-time comparison  
Authority: Founder-approved in the CHIST-001 development lane  
Primary issue: https://github.com/jlhogarth/CoMind/issues/208  
Primary implementation PR: https://github.com/jlhogarth/CoMind/pull/209

## Decision

The following ten rules are normative. They define the boundary between source evidence, normalized projections, derived interpretation, and future observations. A future change requires an explicit architecture decision with migration and verification evidence where applicable.

## Locked rules

### CHIST-AR-001: Source model is a graph

A native ChatGPT conversation is preserved as a graph, not flattened into a transcript as the canonical source representation. The complete `mapping` topology is source evidence. Relational rows, selected-branch transcripts, search indexes, and rendered views are projections over that preserved source.

### CHIST-AR-002: `current_node` selects a branch, not a conversation

`current_node` identifies the selected terminal node when the source provides it. It does not erase inactive branches. All branches remain preserved source evidence. If `current_node` is declared but cannot be proven against the mapping, ingestion fails closed for that conversation. If it is absent, downstream branch resolution may use a separately governed deterministic fallback without rewriting the source.

### CHIST-AR-003: Export shards form one snapshot

A single export may contain `conversations.json`, numbered shards such as `conversations-000.json`, or nested export archives. Those physical files constitute one logical point-in-time source snapshot. Sharding must not create separate historical baselines.

### CHIST-AR-004: Raw JSON is canonical source evidence

The source archive and preserved raw conversation/node JSON are authoritative evidence of what the export contained. Normalized relational structures are indexes and projections. Unknown future fields are preserved and inventoried as non-degrading schema-drift telemetry instead of being silently discarded.

### CHIST-AR-005: Message content is polymorphic

No canonical ingestion rule may assume every message has `content_type = text`, that `parts` contains only strings, or that only user/assistant roles exist. Raw content remains authoritative. Text extraction, multimodal interpretation, role filtering, and human-readable rendering are derived operations.

### CHIST-AR-006: Content identity and topology identity are separate

CoMind independently fingerprints normalized message content and graph topology, including selected-branch identity when supplied by the source. Point-in-time comparison must distinguish content change from structural change. A topology change is evidence of structural difference, not automatically corruption.

### CHIST-AR-007: Attachment references and physical assets are separate evidence layers

The attachment reference embedded in a message and the physical asset included in an export are separate observations. CoMind preserves both, records deterministic reference-to-asset resolution when provable, and records unresolved or ambiguous coverage without fabricating a match. A source export that omits an asset remains a valid observation of that omission.

### CHIST-AR-008: Schema drift is preserved; provenance-breaking structure fails closed

Unknown fields, new content types, and additive metadata are preserved and inventoried without degrading an otherwise valid import. Structural contradictions that prevent provenance from being proven, including invalid identifiers, broken parent/child topology, duplicate source identities, or graph cycles, fail closed or are quarantined with explicit evidence.

### CHIST-AR-009: Source evidence never auto-promotes to canonical cognition

No imported source field automatically becomes durable memory, a Rulebook rule, decision, assumption, architecture fact, task, or other canonical cognition. Analytics and promotion candidates are derived evidence with lineage and remain review-only unless separately authorized.

### CHIST-AR-010: Future exports are observations, not replacements

Each later export is a new point-in-time observation. Export N+1 does not overwrite Export N. Comparison classifies unchanged, content-changed, structurally changed, new, and absent observations. Absence in a later export does not establish deletion. Earlier source snapshots remain preserved.

## Enforcement map

The implementation must maintain these controls:

- immutable archive source identity and per-file SHA-256 inventory;
- complete raw conversation and raw node preservation;
- graph integrity checks across the complete mapping;
- `current_node` integrity validation when declared;
- duplicate conversation and message identity detection;
- content and topology hashes stored separately;
- sharded and nested export discovery under one archive identity;
- non-degrading schema-drift inventory in the import receipt;
- attachment reference coverage and physical-asset resolution in the import receipt/evidence;
- explicit PASS/WARN/FAIL and quarantine semantics;
- independent baseline certification after technical ingestion;
- review-only derivations and promotion candidates;
- immutable point-in-time comparison receipts.

## Non-goals

These rules do not claim that OpenAI exports are complete, stable, or a near-real-time API. They do not authorize production activation, automatic memory promotion, destructive pruning, or source-history rewriting.

## Verification

The CHIST and ChatGPT Archive Ingestion CI gates are the executable acceptance surfaces for these rules. The first real native OpenAI export is a conformance specimen against this architecture, not the source of the architecture itself.
