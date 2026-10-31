#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-A03 verification}"
DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os,sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CHIST-A03 verification outside local isolated comind_ci.',file=sys.stderr); raise SystemExit(2)
PY
bash "${root}/scripts/test_chist_a02_sessionization.sh"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261031_034_chist_a03_corpus_analytical_substrate.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
 r uuid := 'a3030001-0000-4000-8000-000000000001';
 b uuid := 'a2350001-0000-4000-8000-000000000003';
 i uuid := 'a2350001-0000-4000-8000-000000000002';
BEGIN
 INSERT INTO comind.cm_corpus_analytical_run(analytical_run_id,baseline_id,import_id,policy_key,policy_version,analysis_mode,engine_kind,engine_version,run_identity_sha256,actor,source_branch,source_head_sha,evidence)
 VALUES(r,b,i,'chist-a03.synthetic','v1','deterministic','sql','v1',repeat('a',64),'chist-a03-test','synthetic',repeat('b',40),'{"synthetic":true}');
 INSERT INTO comind.cm_corpus_analytical_observation(analytical_run_id,import_id,source_conversation_id,observation_kind,analysis_mode,actor_role,branch_class,concept_key,occurrence_count,observation_sha256,source_lineage)
 VALUES(r,i,'conv-a','concept_census','deterministic','user','active_path','synthetic.concept',2,repeat('c',64),'{"synthetic":true}');
 IF (SELECT count(*) FROM comind.cm_corpus_analytical_observation WHERE analytical_run_id=r) <> 1 THEN RAISE EXCEPTION 'expected one analytical observation'; END IF;
 BEGIN UPDATE comind.cm_corpus_analytical_run SET actor='mutated' WHERE analytical_run_id=r; RAISE EXCEPTION 'run mutation unexpectedly succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='run mutation unexpectedly succeeded' THEN RAISE; END IF; END;
 BEGIN DELETE FROM comind.cm_corpus_analytical_observation WHERE analytical_run_id=r; RAISE EXCEPTION 'observation deletion unexpectedly succeeded'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='observation deletion unexpectedly succeeded' THEN RAISE; END IF; END;
 BEGIN
   INSERT INTO comind.cm_corpus_analytical_run(baseline_id,import_id,policy_key,policy_version,analysis_mode,engine_kind,engine_version,run_identity_sha256,actor,source_branch,source_head_sha)
   VALUES(b,'00000000-0000-4000-8000-000000000000','bad','v1','deterministic','sql','v1',repeat('d',64),'test','synthetic',repeat('e',40));
   RAISE EXCEPTION 'uncertified pair unexpectedly succeeded';
 EXCEPTION WHEN foreign_key_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM='uncertified pair unexpectedly succeeded' THEN RAISE; END IF; END;
END $$;
SQL
PGPASSWORD=archive-reader-test-password psql -h localhost -U chist_archive_reader_login -d comind_ci -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE comind_conversation_history_reader;
SELECT count(*) FROM comind.cm_corpus_analytical_run;
SELECT count(*) FROM comind.cm_corpus_analytical_observation;
SQL
echo 'CHIST-A03 analytical substrate synthetic acceptance passed.'
