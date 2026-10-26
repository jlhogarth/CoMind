#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-001 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CHIST-001 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

(
  cd "${root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)
for migration in \
  20261012_001_chatgpt_archive_ingestion.sql \
  20261012_002_chatgpt_archive_quarantine.sql \
  20261012_003_chatgpt_archive_access_hardening.sql \
  20261025_007_native_chatgpt_live_reconciliation.sql \
  20261025_008_native_chatgpt_live_reconciliation_live_read_boundary.sql \
  20261025_009_native_chatgpt_live_reconciliation_ambiguity_hardening.sql \
  20261025_010_native_chatgpt_live_reconciliation_snapshot_identity.sql \
  20261025_011_native_chatgpt_live_reconciliation_policy_hardening.sql \
  20261026_001_conversation_history_reader.sql \
  20261026_002_conversation_history_baseline_certification.sql \
  20261026_004_conversation_history_archive_derivation.sql
 do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/${migration}"
 done

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chist_history_login') THEN DROP ROLE chist_history_login; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chist_certifier_login') THEN DROP ROLE chist_certifier_login; END IF;
  CREATE ROLE chist_history_login LOGIN PASSWORD 'history-test-password'
    NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE chist_certifier_login LOGIN PASSWORD 'certifier-test-password'
    NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT comind_conversation_history_reader TO chist_history_login WITH INHERIT FALSE, SET TRUE;
  GRANT comind_conversation_history_certifier TO chist_certifier_login WITH INHERIT FALSE, SET TRUE;
END
$$;

INSERT INTO comind.cm_conversation (conv_id,source,title,external_ref,metadata,created_at) VALUES (
  'c2080001-0000-4000-8000-000000000001','native_chatgpt_live','Continuity architecture','native-history-1',
  '{"native_chatgpt_source_conversation_id":"native-history-1","source_system":"chatgpt"}'::jsonb,
  '2026-10-26T18:00:00Z'
);

INSERT INTO comind.cm_archive_source (
  source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata
) VALUES (
  'c2080001-0000-4000-8000-000000000101','chatgpt','chist-fixture.zip',repeat('1',64),2048,'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,
  reconciliation,receipt,receipt_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000102','c2080001-0000-4000-8000-000000000101',
  'chist-fixture','archive-v1','PASS','2026-10-26T18:01:00Z','2026-10-26T18:02:00Z',
  1,2,2,1,1,2,2,1,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('2',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,
  node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'c2080001-0000-4000-8000-000000000102','native-history-1','Continuity architecture',
  '2026-10-26T18:00:00Z','2026-10-26T18:00:10Z',repeat('3',64),repeat('4',64),repeat('5',64),2,2,1,
  '{"id":"native-history-1","current_node":"node-2","mapping":{"node-1":{"parent":null,"children":["node-2"]},"node-2":{"parent":"node-1","children":[]}}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,
  role,created_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES
  ('c2080001-0000-4000-8000-000000000102','native-history-1','node-1',NULL,'["node-2"]','msg-1','user',
   '2026-10-26T18:00:00Z','text',repeat('6',64),repeat('7',64),
   '{"parent":null,"children":["node-2"],"message":{"id":"msg-1","author":{"role":"user"},"content":{"content_type":"text","parts":["Preserve conversation continuity and history."]}}}'::jsonb),
  ('c2080001-0000-4000-8000-000000000102','native-history-1','node-2','node-1','[]','msg-2','assistant',
   '2026-10-26T18:00:10Z','text',repeat('8',64),repeat('9',64),
   '{"parent":"node-1","children":[],"message":{"id":"msg-2","author":{"role":"assistant"},"content":{"content_type":"text","parts":["Capture first. Interpret second. Promote deliberately."]}}}'::jsonb);
INSERT INTO comind.cm_archive_attachment_reference (
  import_id,source_conversation_id,source_node_id,source_message_id,reference_kind,source_reference,source_metadata,reference_hash
) VALUES (
  'c2080001-0000-4000-8000-000000000102','native-history-1','node-2','msg-2','file','file-history-1','{"name":"history.txt"}'::jsonb,repeat('a',64)
);

INSERT INTO comind.cm_conversation_reconciliation_receipt (
  reconciliation_id,import_id,source_conversation_id,reconciliation_version,archive_normalized_hash,archive_topology_hash,
  live_snapshot_cutoff,live_candidate_set_sha256,result,selected_conv_id,match_method,classification_counts,conflicts,unresolved,evidence,receipt_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000201','c2080001-0000-4000-8000-000000000102','native-history-1','fixture-v1',
  repeat('4',64),repeat('5',64),'2026-10-26T18:03:00Z',repeat('b',64),'exact_match',
  'c2080001-0000-4000-8000-000000000001','explicit_source_id','{"exact_candidate":1}'::jsonb,'[]','[]','{"synthetic":true}',repeat('c',64)
);
INSERT INTO comind.cm_conversation_reconciliation_candidate (
  reconciliation_id,conv_id,candidate_rank,match_method,match_strength,classification,selected,evidence,candidate_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000201','c2080001-0000-4000-8000-000000000001',1,'explicit_source_id','strong','exact_candidate',true,'{"explicitIdentity":true}',repeat('d',64)
);

INSERT INTO comind.cm_conversation_derivation_run (
  derivation_run_id,conv_id,policy_version,engine_kind,source_snapshot_sha256,run_identity_sha256,
  source_message_count,source_capture_event_count,source_checkpoint_count,source_max_capture_sequence,result_state,source_stats,engine_metadata
) VALUES (
  'c2080001-0000-4000-8000-000000000301','c2080001-0000-4000-8000-000000000001','fixture-v1','deterministic',
  repeat('e',64),repeat('f',64),2,0,0,0,'completed','{}','{}'
);
INSERT INTO comind.cm_conversation_derivation (
  derivation_id,derivation_run_id,conv_id,derivation_kind,source_kind,value_text,confidence,salience,conflict_state,evidence,metadata,derivation_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000302','c2080001-0000-4000-8000-000000000301','c2080001-0000-4000-8000-000000000001',
  'intent','conversation_aggregate','Preserve conversation continuity and history.',0.95,0.95,'none','{"source":"fixture"}','{}',repeat('0',64)
);
INSERT INTO comind.cm_conversation_promotion_candidate (
  candidate_id,derivation_run_id,conv_id,derivation_id,target_type,proposed_title,proposed_content,rationale,
  confidence,salience,conflict_state,evidence,candidate_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000303','c2080001-0000-4000-8000-000000000301','c2080001-0000-4000-8000-000000000001',
  'c2080001-0000-4000-8000-000000000302','memory','Conversation continuity intent','Preserve conversation continuity and history.',
  'Review-only fixture candidate.',0.95,0.95,'none','{"source":"fixture"}',repeat('1',64)
);
SQL

# A technically PASS import must remain invisible until explicit CHIST certification.
uncertified_count=$(PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -At -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_reader; SELECT count(*) FROM comind.cm_archive_import;")
if [[ "${uncertified_count##*$'\n'}" != "0" ]]; then
  echo "History reader saw uncertified PASS evidence: ${uncertified_count}" >&2
  exit 1
fi

# Certify the exact PASS import using a separate constrained SET-only authority.
PGPASSWORD=certifier-test-password psql -h localhost -U chist_certifier_login -d comind_ci -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE comind_conversation_history_certifier;
INSERT INTO comind.cm_conversation_history_baseline (
  baseline_id,import_id,source_archive_id,source_archive_sha256,certification_version,
  source_kind,certified_by,certification_reason,evidence,certification_sha256
) VALUES (
  'c2080001-0000-4000-8000-000000000401',
  'c2080001-0000-4000-8000-000000000102',
  'c2080001-0000-4000-8000-000000000101',repeat('1',64),'chist-cert-v1',
  'native_openai_export','isolated-test-certifier','Synthetic fixture certification for governed acceptance only.',
  '{"synthetic":true,"scope":"isolated_test_only"}'::jsonb,repeat('a',64)
);
RESET ROLE;
SQL

cd "${root}/server"
npm run build

history_url="postgresql://chist_history_login:history-test-password@localhost:5432/comind_ci"
export COMIND_DATABASE_PURPOSE=chatgpt_history
export CHATGPT_HISTORY_DATABASE_URL="${history_url}"

node dist/history/conversation-history-cli.js --preflight > /tmp/chist_preflight.json
node dist/history/conversation-history-cli.js status > /tmp/chist_status.json
node dist/history/conversation-history-cli.js list --limit 10 > /tmp/chist_list.json
node dist/history/conversation-history-cli.js search continuity --limit 10 > /tmp/chist_search.json
node dist/history/conversation-history-cli.js show native-history-1 > /tmp/chist_show.json

python3 - <<'PY'
import json
pre=json.load(open('/tmp/chist_preflight.json'))
status=json.load(open('/tmp/chist_status.json'))
lst=json.load(open('/tmp/chist_list.json'))
search=json.load(open('/tmp/chist_search.json'))
show=json.load(open('/tmp/chist_show.json'))
assert pre['ok'] is True and pre['preflight']['currentUser']=='comind_conversation_history_reader'
assert status['baselineState']=='accepted' and status['importCounts']['PASS']==1
assert len(lst)==1 and lst[0]['sourceConversationId']=='native-history-1'
assert len(search)==1 and search[0]['sourceConversationId']=='native-history-1'
assert show['provenanceLayer']=='source_evidence'
assert show['topologyHash']=='5'*64
assert len(show['nodes'])==2 and all(n['onActiveBranch'] for n in show['nodes'])
assert show['nodes'][0]['contentText']=='Preserve conversation continuity and history.'
assert len(show['attachments'])==1
assert show['reconciliation']['result']=='exact_match'
assert show['derived']['provenanceLayer']=='derived_evidence'
assert len(show['derived']['analytics'])==1
assert len(show['derived']['promotionCandidates'])==1
print('CHIST-001 governed Conversation History retrieval: PASS')
PY

# Prove the constrained reader cannot mutate source or derived evidence.
if PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_reader; UPDATE comind.cm_archive_conversation_observation SET title='forbidden' WHERE source_conversation_id='native-history-1';" >/tmp/chist_forbidden.out 2>&1; then
  echo 'History reader unexpectedly mutated source evidence' >&2
  exit 1
fi
if PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 \
  -c "SET ROLE comind_conversation_history_reader; SELECT count(*) FROM comind.cm_memory_node;" >/tmp/chist_memory.out 2>&1; then
  echo 'History reader unexpectedly read canonical memory' >&2
  exit 1
fi

echo 'CHIST-001 isolated acceptance: PASS'
