# CHIST-K01 Recovery and Acceptance Repair Provenance

Date: 2026-10-31
Issue: #244
PR: #247
Branch: `chist-k01-hybrid-rag-foundation`
Production change: false
Paid provider use: false

## Recovery context

L4A supervision resumed CHIST-K01 from a stale draft PR after the Conversation History retrieval lane had accumulated implementation and acceptance drift. Recovery preserved the existing issue, branch, and PR rather than creating a competing lane.

## Collision-safe main reconciliation

The branch was compared with current `main` before history reconciliation. The intervening main commits changed L4A management-plane and governance files only. No path overlapped the twelve CHIST-K01 changed files observed before reconciliation.

The twelve live CHIST blobs were pinned exactly, including executable file modes for both acceptance scripts, then replayed over current main with a two-parent reconciliation commit. No CHIST implementation content was silently replaced by main and no management-plane change was dropped.

Reconciled checkpoint: `fb30ce223f537bed5ab9528c54b05d48ff006b6b`
Compared main: `64737db8cc3900885df9ed125b1078e38336edc7`
Observed collision overlap: 0 paths

## Repair 1: pgvector type visibility

The governed Conversation History roles reached `cm_record_retrieval_embedding(...)` but could not resolve the `extensions.vector` argument type because they lacked `USAGE` on schema `extensions`.

Forward migration `20261031_002_chist_k01_pgvector_type_visibility.sql` grants only schema usage to the existing reader and deriver roles. It does not grant table ownership, arbitrary mutation, or broader function authority.

## Repair 2: duplicate deterministic A02 bootstrap

The linked-mutation hardening wrapper bootstrapped the CHIST-A02 deterministic fixture and then invoked the canonical K01 acceptance script, which bootstrapped A02 again against the same isolated database. The second bootstrap collided with deterministic fixture identifiers.

The wrapper now lets the canonical K01 acceptance establish the CHIST-001/A01/A02 chain exactly once. It intercepts the successful K01 migration boundary only to apply forward repair migrations before governed K01 behavior executes.

A shell-safety follow-up preserved the canonical script's intentional negative migration test by avoiding mutation of the caller's `errexit` state inside the wrapped `psql` function.

## Repair 3: PostgreSQL PL/pgSQL output-variable ambiguity

After repairs 1 and 2, exact-head acceptance advanced through CHIST-001, A01, and A02 and into K01 retrieval behavior. PostgreSQL 17 then rejected the lexical search function because unqualified `chunk_id` inside a PL/pgSQL `RETURNS TABLE` function could refer either to an output variable or to a CTE column.

The same latent ambiguity existed in semantic and hybrid ranking expressions.

Forward migration `20261031_003_chist_k01_search_function_qualification.sql` replaces the three search functions with semantically equivalent definitions that fully qualify ranking columns and joins:

- lexical: `r.score`, `r.chunk_id`;
- semantic: `r.distance`, `r.chunk_id`;
- hybrid lexical: `l.lexical_score`, `l.chunk_id`;
- hybrid semantic: `s.semantic_distance`, `s.chunk_id`.

The repair reasserts PUBLIC revocation and the existing governed reader/deriver EXECUTE grants. It does not broaden the security model.

## Canonical Test preflight

Before any K01 migration was applied to canonical Supabase Test, read-only preflight confirmed:

- `comind_conversation_history_reader` exists;
- `comind_conversation_history_deriver` exists;
- `comind.cm_embedding` contains zero rows;
- K01 retrieval tables are not yet present;
- neither governed role currently has `USAGE` on `extensions`.

This matches the intended forward-migration precondition and avoids destructive conversion of an existing embedding corpus.

## Current acceptance boundary

Repository exact-head acceptance must pass after all repair commits. Only then may the same migrations be applied to canonical Supabase Test, followed by independent schema/privilege/readback and advisor review. PR #247 must remain unmerged until those gates, current-main freshness, mergeability, review-thread, and exact-head CI requirements are all satisfied.
