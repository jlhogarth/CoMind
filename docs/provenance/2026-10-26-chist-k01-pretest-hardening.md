# CHIST-K01 Pre-Test Hardening Evidence

**Status:** Pre-Test hardening in progress  
**Date:** 2026-10-26 / 2026-10-27  
**Lane:** CHIST-K01  
**Issue:** #244  
**PR:** #247  
**Production impact:** None  
**Supabase Test K01 impact:** None; K01 migrations have not been applied

## In this document

- [Purpose](#purpose)
- [Finding 1: legacy IVFFlat fixture operator class](#finding-1-legacy-ivfflat-fixture-operator-class)
- [Finding 2: linked-only immutability trigger semantics](#finding-2-linked-only-immutability-trigger-semantics)
- [Control response](#control-response)
- [Acceptance impact](#acceptance-impact)
- [Lessons](#lessons)

## Purpose

Preserve the K01 failures and review findings that occurred before any K01 schema was deployed to Supabase Test. These findings are part of the evidence that the lane is validating both migration behavior and cross-application safety rather than treating a green happy-path query as sufficient acceptance.

## Finding 1: legacy IVFFlat fixture operator class

Dedicated CHIST-K01 workflow run #3 (`40426908266`) checked out and verified exact candidate `1da9a31f82c71047de3b8ac373051ccc68d2a13c` successfully. The full accepted CHIST-001, A01, and A02 prerequisite chain passed.

K01 then failed while constructing the synthetic legacy vector fixture, before migration 013 was applied.

The fixture attempted:

```sql
CREATE INDEX IF NOT EXISTS idx_embedding_vec
  ON comind.cm_embedding USING ivfflat (vec extensions.vector_cosine_ops) WITH (lists=100);
```

PostgreSQL rejected the explicitly schema-qualified operator class:

```text
ERROR: operator class "extensions.vector_cosine_ops" does not exist for access method "ivfflat"
```

The actual CoMind legacy schema and Supabase Test index use the unqualified operator class `vector_cosine_ops`. The fixture was corrected to reproduce that actual shape exactly.

This was a fixture defect, not a K01 migration defect. Migration 013 was not accepted or deployed on the basis of this failed run.

## Finding 2: linked-only immutability trigger semantics

Independent code review found that the initial K01 source-link protection triggers returned `OLD` for every permitted UPDATE on `cm_doc`, `cm_doc_chunk`, and `cm_embedding`.

For a PostgreSQL `BEFORE UPDATE` row trigger, returning `OLD` would silently suppress intended changes to generic rows that are not linked to Conversation History retrieval evidence. That would create a cross-application regression even though linked K01 evidence remained protected.

The correction is forward migration:

`db/migrations/20261026_014_conversation_history_hybrid_rag_linked_mutation_hardening.sql`

Correct behavior is now explicit:

- if a row is linked to K01 retrieval evidence, UPDATE/DELETE raises and fails closed;
- if an unlinked row is being deleted, return `OLD`;
- if an unlinked row is being updated, return `NEW`.

The acceptance wrapper `scripts/test_chist_k01_linked_mutation_hardening.sh` must prove both sides with owner-level operations:

- unlinked generic documents, chunks, and embeddings remain updateable and deletable;
- linked generic documents, chunks, and embeddings remain immutable.

## Control response

No K01 migration has been applied to Supabase Test.

The lane response was:

1. preserve the failed workflow as evidence;
2. correct the legacy fixture in the repository rather than patching CI at runtime;
3. add migration 014 for linked-only immutability semantics;
4. add executable regression tests covering unlinked and linked generic RAG rows;
5. keep PR #247 draft;
6. restart exact-head acceptance from the newest candidate;
7. continue to block Supabase Test until dedicated K01 and broad CI are green on the same exact head.

## Acceptance impact

Earlier workflow runs are superseded for final acceptance whenever a newer K01 candidate exists.

Final K01 acceptance still requires:

- exact-head K01 PostgreSQL 17 + pgvector PASS;
- broad CI PASS on the same candidate;
- fresh-install schema synchronized to the accepted provider-neutral shape;
- rerun after fresh-install synchronization;
- bounded Supabase Test migrations 013/014 only after repository acceptance;
- Test readback and security/performance advisor review;
- production unchanged.

## Lessons

Synthetic fixtures must reproduce real extension/operator-class naming and schema placement, not an intuitive approximation.

Evidence immutability must be scoped narrowly. Protecting K01-derived evidence must not silently change behavior for generic platform rows that are outside K01.

A migration can be locally correct for its new feature and still be unacceptable if it changes unrelated application semantics. Cross-application behavior is therefore part of K01 acceptance, not a later cleanup task.
