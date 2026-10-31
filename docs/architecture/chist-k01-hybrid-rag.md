# CHIST-K01 Governed Hybrid Conversation History Retrieval

**Lifecycle:** Specified / implementation candidate  
**Issue:** #244  
**Environment:** Repository + Supabase Test only  
**Production:** Unchanged  
**Source authority:** Certified native Conversation History archive remains authoritative

## In this document

- [Purpose](#purpose)
- [Reuse decision](#reuse-decision)
- [Evidence boundaries](#evidence-boundaries)
- [Chunk policy](#chunk-policy)
- [Embedding architecture](#embedding-architecture)
- [Lexical retrieval](#lexical-retrieval)
- [Semantic retrieval](#semantic-retrieval)
- [Hybrid ranking](#hybrid-ranking)
- [Security](#security)
- [Performance posture](#performance-posture)
- [Acceptance](#acceptance)
- [Deferred work](#deferred-work)
- [External references](#external-references)

## Purpose

CHIST-K01 makes certified Conversation History searchable as a governed knowledge substrate. It does not rewrite archive evidence and it does not promote retrieved material into memory, rules, decisions, architecture, Digital Twin traits, or model-training corpora.

The goal is citation-ready retrieval where every result can be traced to the exact archived conversation, node, message, source hashes, extraction policy, and point-in-time import.

## Reuse decision

CoMind already has generic document, chunk, vector, and knowledge-graph structures:

- `comind.cm_doc`
- `comind.cm_doc_chunk`
- `comind.cm_embedding`
- `comind.cm_kg_node`
- `comind.cm_kg_edge`

K01 adapts that substrate instead of adding a second vector database or parallel document store.

The legacy Test embedding store is empty but fixed at `vector(1536)` and has an IVFFlat cosine index. K01 migrates this empty Test shape to provider-neutral variable-dimension vectors. The migration fails closed if an environment already contains embedding rows.

## Evidence boundaries

The immutable archive tables remain source evidence. K01 artifacts are derived retrieval evidence.

The evidence chain is:

`native archive -> certified import -> archived node -> deterministic text projection -> generic document/chunk -> CHIST retrieval lineage -> optional embedding observation -> lexical/semantic/hybrid result`

A later point-in-time export creates a separate corpus identity. It does not overwrite an earlier corpus.

## Chunk policy

The initial policy is `conversation_history_chunk / message-text-v1`.

One archived message node produces at most one retrieval chunk. Empty text is excluded. Text extraction matches the existing Conversation History reader semantics:

1. direct string `message.content`;
2. string entries in `content.parts[]`;
3. object entries in `content.parts[]` with a string `.text`;
4. `content.text` fallback;
5. `message.text` fallback.

Multiple text parts are joined with a newline in source order.

This policy deliberately avoids premature token-size or overlapping-window chunking. Message-grain chunks maximize source citation precision. Later chunk policies may aggregate or overlap messages, but they must remain separate versioned derivations.

## Embedding architecture

No embedding provider, model, revision, or dimension is treated as source truth.

`cm_embedding_profile` records:

- provider;
- model;
- model revision when relevant;
- dimension;
- cosine distance metric;
- purpose;
- versioned definition hash.

The generic `cm_embedding.vec` becomes variable-dimension `vector`. `dims` has no default and must match `vector_dims(vec)`.

K01 does not create an approximate-nearest-neighbor index. Exact cosine retrieval is intentional for the initial empty/small corpus and avoids choosing a production model dimension before evidence exists.

## Lexical retrieval

`cm_doc_chunk.fts_simple` is a stored generated `tsvector` using PostgreSQL's `simple` text-search configuration, with a GIN index.

The `simple` configuration is chosen for the initial technical-history corpus because aggressive language stemming can be undesirable for identifiers, issue numbers, code names, database objects, model names, and other technical tokens.

The lexical search function uses `websearch_to_tsquery('simple', query)` and returns rank, score, chunk text, and archive source lineage.

## Semantic retrieval

Semantic retrieval uses exact cosine distance over embeddings associated with one explicit embedding profile and one retrieval corpus.

The query vector dimension must equal the profile dimension. A mismatch fails closed before comparison.

Each embedding is separately linked to its corpus, chunk, document, profile, and vector hash. Re-recording identical embedding evidence is idempotent. Attempting to replace it with a different vector fails closed.

## Hybrid ranking

The initial rank policy is `hybrid_rrf / rrf-v1`.

It uses Reciprocal Rank Fusion with `k=50`, lexical weight `1`, and semantic weight `1`:

`score = lexical_weight / (k + lexical_rank) + semantic_weight / (k + semantic_rank)`

Absent components contribute zero. Results expose:

- lexical rank;
- semantic rank;
- lexical score;
- semantic distance;
- semantic similarity;
- fused score;
- chunk content;
- exact archived conversation/node/message lineage.

Ranks use deterministic chunk-ID tie breaking.

## Security

K01 reuses the established private Conversation History authorities:

- `comind_conversation_history_deriver` builds retrieval corpus evidence and records embeddings through constrained functions;
- `comind_conversation_history_reader` can execute read-only lexical, semantic, and hybrid retrieval functions;
- neither role receives direct write authority on K01 evidence tables;
- the history reader receives no raw `cm_embedding` or generic `cm_doc_chunk` table access;
- Data API roles receive no K01 table or retrieval-function access;
- K01 evidence tables use forced RLS;
- source-linked documents, chunks, and embeddings become immutable while linked to K01 evidence.

## Performance posture

K01 starts with exact vector search. This is a deliberate best-practice choice for an unmeasured corpus rather than an omission.

After the real Conversation History export is certified and an embedding profile is selected, benchmark:

- corpus and chunk counts;
- query latency distribution;
- filter selectivity;
- exact-search latency;
- embedding storage size;
- retrieval quality against a human-reviewed evaluation set.

Only then should K01 consider profile-specific HNSW indexes. If HNSW is introduced with selective filters, evaluate pgvector iterative scans and profile-specific or partial indexes.

## Acceptance

K01 synthetic acceptance must prove:

- a non-empty legacy embedding table blocks provider-neutral migration;
- the empty legacy `vector(1536)` + IVFFlat shape migrates to variable-dimension exact-search storage;
- the legacy IVFFlat index is removed;
- deterministic text extraction matches the Conversation History reader contract;
- corpus build is idempotent;
- uncertified imports are rejected;
- generic document/chunk structures are actually reused;
- exact archive source lineage is preserved;
- lexical and semantic ranking can disagree as designed;
- RRF combines and exposes both signals deterministically;
- dimension mismatch fails closed;
- embedding evidence is idempotent and cannot be silently replaced;
- reader search works while direct mutation/raw vector access does not;
- Data API access remains absent;
- dedicated exact-head CI, broad CI, Supabase Test readback, and advisor review pass before merge.

## Deferred work

Not part of K01 v0.1:

- selecting a production embedding provider/model;
- paid embedding generation;
- HNSW or another ANN index;
- conversational answer generation over retrieved evidence;
- cross-source GitHub/Drive/Vercel/Supabase ingestion;
- durable retrieval-query receipts;
- human relevance benchmark corpus;
- automated memory or Digital Twin promotion;
- training/fine-tuning corpus generation.

These capabilities can build on K01 without changing its evidence boundary.

## External references

- Supabase Hybrid Search: https://supabase.com/docs/guides/ai/hybrid-search
- Supabase HNSW indexes: https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes
- pgvector upstream: https://github.com/pgvector/pgvector

These references informed the use of PostgreSQL FTS, exact vector search at small/unmeasured scale, explicit hybrid fusion, provider-neutral vector dimensions, and deferred evidence-based HNSW adoption.
