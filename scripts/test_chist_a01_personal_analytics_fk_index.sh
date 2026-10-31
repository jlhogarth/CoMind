#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-A01 verification}"

# Run the accepted A01 functional, determinism, and authority proof first.
bash "${root}/scripts/test_chist_a01_personal_analytics.sh"

# Apply the forward-only advisor hardening migration.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_010_conversation_history_personal_analytics_fk_index.sql"

# Prove that the composite foreign key has an index whose leading columns
# exactly match (archive_derivation_run_id, import_id, source_conversation_id).
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_columns text[];
BEGIN
  SELECT array_agg(a.attname ORDER BY k.ordinality)
    INTO v_columns
    FROM pg_catalog.pg_class i
    JOIN pg_catalog.pg_namespace ns ON ns.oid=i.relnamespace
    JOIN pg_catalog.pg_index ix ON ix.indexrelid=i.oid
    JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid=ix.indrelid
     AND a.attnum=k.attnum
   WHERE ns.nspname='comind'
     AND i.relname='idx_cm_archive_metric_fact_run_scope_fk';

  IF v_columns IS DISTINCT FROM ARRAY[
    'archive_derivation_run_id',
    'import_id',
    'source_conversation_id'
  ]::text[] THEN
    RAISE EXCEPTION 'CHIST-A01 composite FK covering index mismatch: %',v_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=t.relnamespace
     WHERE ns.nspname='comind'
       AND t.relname='cm_archive_metric_fact'
       AND c.conname='cm_archive_metric_fact_run_scope_fk'
       AND c.contype='f'
  ) THEN
    RAISE EXCEPTION 'CHIST-A01 expected composite run-scope foreign key is absent';
  END IF;
END
$$;
SQL

echo 'CHIST-A01 composite foreign-key index acceptance: PASS'
