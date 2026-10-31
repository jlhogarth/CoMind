# CHIST-K01 pgvector Schema Portability Contract

**Status:** Candidate hardening  
**Date:** 2026-10-27  
**Lane:** CHIST-K01  
**Issue:** #244  
**PR:** #247  
**Production impact:** None  
**Supabase Test K01 impact:** None; K01 migrations remain undeployed

## Purpose

Record the pgvector extension-placement discrepancy found by exact-head K01 acceptance and the chosen forward architecture contract.

## Evidence

Repository fresh-install bootstrap previously used:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

without a schema. In an ordinary fresh PostgreSQL database this installs pgvector in the first suitable schema on the active search path, which was `public` in the isolated K01 runner.

Supabase Test currently reports:

- PostgreSQL 17.11;
- pgvector 0.8.2;
- `vector` extension schema: `extensions`;
- `pgcrypto` extension schema: `extensions`;
- database search path includes `public, extensions`.

K01 migration 013 intentionally used Supabase's `extensions.vector` shape. Exact-head run #7 therefore failed before migration 013 acceptance when its isolated bootstrap had created pgvector in `public`.

## Decision

CoMind fresh-install bootstrap now standardizes pgvector in `extensions`:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

The generic RAG schema and vector-index bootstrap scripts include `extensions` in their explicit search paths so unqualified `vector(...)` and `vector_cosine_ops` resolve correctly.

## Existing databases

K01 does not relocate an already-installed vector extension in an existing database.

This is deliberate. Moving a shared extension can change name resolution for unrelated consumers and is broader than the K01 Test-only authority required here.

Supabase Test already satisfies the standardized extension-schema contract, so no extension relocation is required there.

A pre-existing development database that installed pgvector elsewhere should be treated as an environment-alignment case rather than silently rewritten by K01. Fresh/reset development environments will use the standardized bootstrap.

## Acceptance impact

The K01 exact-head gate must now prove:

1. the accepted CoMind bootstrap installs pgvector into `extensions` on a fresh PostgreSQL 17 database;
2. the legacy fixed-dimension `cm_embedding` shape is still reproduced before migration 013;
3. the non-empty legacy migration guard still fails closed;
4. migration 013 then converts the empty legacy store to provider-neutral variable-dimension storage;
5. migration 014 preserves linked-only immutability semantics;
6. all lexical, semantic, RRF, lineage, role, and Data API assertions pass.

No K01 migration may be applied to Supabase Test until the dedicated exact-head gate and broad CI pass on the same final candidate.

## Related evidence

- `db/sql/v2/01_extensions.sql`
- `db/sql/v2/03_schema_graph_rag.sql`
- `db/sql/v2/08_indexes_constraints.sql`
- `db/migrations/20261026_013_conversation_history_hybrid_rag.sql`
- `db/migrations/20261026_014_conversation_history_hybrid_rag_linked_mutation_hardening.sql`
- `docs/provenance/2026-10-26-chist-k01-pretest-hardening.md`
- K01 exact-head workflow run #7: `40427604998`
