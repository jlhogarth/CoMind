# Stale Supabase guarded artifact resolution

Date: 2026-10-07
GitHub issue: #32
Branch: `docs/issue-32-retire-stale-supabase-artifact`

## Decision

Do not import the stale generated `001_guarded_table_foundation.sql` artifact into the repository.

The repository source is already the authoritative schema source. The corrected Library copy, `001_guarded_table_foundation.supabase-fixed.sql`, remains the temporary canonical corrected artifact until a future migration or audit workflow explicitly needs a generated guarded build artifact.

## Evidence

The stale Library artifact contained two assumptions that do not match the current Supabase target or current repository source:

1. It required `current_database() = 'neondb'`.
2. It expected `comind.cm_embedding.vec` to be `vector(3072)` with `dims` defaulting to `3072`.

The corrected Library artifact removes the database-name guard and aligns embeddings to the current source contract:

```sql
dims INT NOT NULL DEFAULT 1536,
vec vector(1536) NOT NULL
```

Repository code search on the current default branch found no matches for:

- `neondb`
- `vector(3072)`
- `DEFAULT 3072`

The current repository source for `db/sql/v2/03_schema_graph_rag.sql` remains the canonical schema location for `cm_embedding`.

## Scope boundary

No live Supabase database was read or mutated for this resolution. No credentials were used or committed. This change records repository provenance only.

## Follow-on

If the generated guarded artifact is needed again, regenerate it from current repository source instead of reviving the stale `001_guarded_table_foundation.sql` file. Any future generated artifact should include a provenance note linking it to the exact source commit used for generation.
