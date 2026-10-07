# Project-scoped memory retrieval and bounded assistant context

Date: 2026-10-07
Issue: #38
Branch: `issue-38-memory-retrieval-context`
Base main: `a6ff54dd91f1e44d44e29a03c6f1d51cd04ddd56`

## Purpose

Connect the existing `comind.cm_memory_node` foundation to assistant generation using a deterministic, bounded retrieval path that requires no additional model call and no embedding API.

## Initial retrieval architecture

- Conversation `project_id` defines the retrieval scope.
- The latest user turn is the lexical retrieval query.
- Eligible memory must be `active`, have non-empty content, and have visibility `internal` or `public`.
- Private memory is excluded from this first general-assistant slice.
- PostgreSQL `pg_trgm` similarity/word-similarity and full-text rank provide lexical relevance.
- Existing memory `priority` and `weight` contribute only after a lexical-match threshold is satisfied, preventing important but irrelevant memory from being injected.
- Ranking uses stable tie-breakers for deterministic order.
- Retrieval is capped by result count, per-memory character length, and total injected-context character count.
- Context is framed as potentially relevant durable context, not as user instruction.
- Retrieval does not update `last_accessed` in this first slice, avoiding one database write per retrieval.

## Initial deterministic tests

The first unit layer covers:

- no database query without project identity,
- latest-user-turn query selection,
- project/status/visibility filtering contract,
- lexical threshold and stable ordering contract,
- bounded candidate/result counts,
- per-memory truncation,
- total context bound including the fixed system preamble,
- no synthetic context for empty candidates,
- explicit context-versus-instruction framing.

## Safety and cost control

No paid provider call, embedding API, additional model pass, live Supabase mutation, or credential access is required for this milestone.
