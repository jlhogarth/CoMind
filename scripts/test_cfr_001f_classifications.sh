#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required}"
: "${CHATGPT_RECONCILIATION_DATABASE_URL:?CHATGPT_RECONCILIATION_DATABASE_URL required}"
: "${COMIND_DATABASE_PURPOSE:?COMIND_DATABASE_PURPOSE required}"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/verification/cfr_001f_classification_fixture.sql"

run_case() {
  local import_id="$1"
  local source_conversation_id="$2"
  local cutoff="$3"
  node "${root}/server/dist/archive/chatgpt-live-reconcile-cli.js" \
    --import-id "${import_id}" \
    --source-conversation-id "${source_conversation_id}" \
    --cutoff "${cutoff}"
}

extension="$(run_case \
  f0020001-0000-4000-8000-000000000102 \
  native-conversation-extension \
  2026-10-25T18:11:00Z)"

live_partial="$(run_case \
  f0030001-0000-4000-8000-000000000102 \
  native-conversation-live-partial \
  2026-10-25T18:21:00Z)"

conflict="$(run_case \
  f0040001-0000-4000-8000-000000000102 \
  native-conversation-conflict \
  2026-10-25T18:31:00Z)"

ambiguous="$(run_case \
  f0050001-0000-4000-8000-000000000102 \
  native-conversation-ambiguous \
  2026-10-25T18:41:00Z)"

unmatched="$(run_case \
  f0060001-0000-4000-8000-000000000102 \
  native-conversation-unmatched \
  2026-10-25T19:01:00Z)"

EXTENSION="${extension}" \
LIVE_PARTIAL="${live_partial}" \
CONFLICT="${conflict}" \
AMBIGUOUS="${ambiguous}" \
UNMATCHED="${unmatched}" \
python3 - <<'PY'
import json
import os

extension = json.loads(os.environ['EXTENSION'])['reconciliation']
live_partial = json.loads(os.environ['LIVE_PARTIAL'])['reconciliation']
conflict = json.loads(os.environ['CONFLICT'])['reconciliation']
ambiguous = json.loads(os.environ['AMBIGUOUS'])['reconciliation']
unmatched = json.loads(os.environ['UNMATCHED'])['reconciliation']

assert extension['result'] == 'compatible_extension', extension
assert extension['matchMethod'] == 'explicit_source_id', extension
assert extension['selectedConvId'] == 'f0020001-0000-4000-8000-000000000001', extension

assert live_partial['result'] == 'compatible_extension', live_partial
assert live_partial['matchMethod'] == 'explicit_source_id', live_partial
assert live_partial['selectedConvId'] == 'f0030001-0000-4000-8000-000000000001', live_partial

assert conflict['result'] == 'conflicting_observation', conflict
assert conflict['matchMethod'] == 'explicit_source_id', conflict
assert conflict['selectedConvId'] == 'f0040001-0000-4000-8000-000000000001', conflict

assert ambiguous['result'] == 'ambiguous_match', ambiguous
assert ambiguous['matchMethod'] == 'weak_correlation', ambiguous
assert ambiguous['selectedConvId'] is None, ambiguous

assert unmatched['result'] == 'unmatched_archive', unmatched
assert unmatched['matchMethod'] == 'none', unmatched
assert unmatched['selectedConvId'] is None, unmatched

print('CFR-001F isolated PostgreSQL classification matrix PASS')
PY

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_extension jsonb;
  v_live_partial jsonb;
  v_conflicts jsonb;
  v_unresolved jsonb;
BEGIN
  SELECT classification_counts INTO v_extension
    FROM comind.cm_conversation_reconciliation_receipt
   WHERE import_id='f0020001-0000-4000-8000-000000000102'
     AND source_conversation_id='native-conversation-extension';
  IF COALESCE((v_extension->>'later_archive_completion')::int,0) <> 1
     OR COALESCE((v_extension->>'archive_only_message')::int,0) <> 1 THEN
    RAISE EXCEPTION 'Later archive completion evidence was not preserved: %', v_extension;
  END IF;

  SELECT classification_counts INTO v_live_partial
    FROM comind.cm_conversation_reconciliation_receipt
   WHERE import_id='f0030001-0000-4000-8000-000000000102'
     AND source_conversation_id='native-conversation-live-partial';
  IF COALESCE((v_live_partial->>'live_only_interrupted_partial')::int,0) <> 1
     OR COALESCE((v_live_partial->>'exact_message')::int,0) <> 2 THEN
    RAISE EXCEPTION 'Live-only interrupted evidence was not preserved: %', v_live_partial;
  END IF;

  SELECT conflicts INTO v_conflicts
    FROM comind.cm_conversation_reconciliation_receipt
   WHERE import_id='f0040001-0000-4000-8000-000000000102'
     AND source_conversation_id='native-conversation-conflict';
  IF jsonb_array_length(COALESCE(v_conflicts,'[]'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'Conflict receipt did not preserve one conflict: %', v_conflicts;
  END IF;

  SELECT unresolved INTO v_unresolved
    FROM comind.cm_conversation_reconciliation_receipt
   WHERE import_id='f0050001-0000-4000-8000-000000000102'
     AND source_conversation_id='native-conversation-ambiguous';
  IF jsonb_array_length(COALESCE(v_unresolved,'[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'Ambiguous receipt did not preserve unresolved evidence: %', v_unresolved;
  END IF;

  IF (SELECT count(*) FROM comind.cm_conversation_reconciliation_receipt
       WHERE import_id IN (
         'f0020001-0000-4000-8000-000000000102',
         'f0030001-0000-4000-8000-000000000102',
         'f0040001-0000-4000-8000-000000000102',
         'f0050001-0000-4000-8000-000000000102',
         'f0060001-0000-4000-8000-000000000102'
       )) <> 5 THEN
    RAISE EXCEPTION 'Expected exactly five matrix receipts';
  END IF;
END;
$$;

SELECT 'PASS' AS cfr_001f_database_classification_matrix;
SQL
