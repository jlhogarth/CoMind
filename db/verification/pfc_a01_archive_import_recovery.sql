-- PFC-A01 / Issue #241: deterministic schema, lineage, and authority verification.

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required)
    INTO v_missing
    FROM unnest(ARRAY['attempt_number','predecessor_import_id','root_import_id','recovery_reason']) required
   WHERE NOT EXISTS (
     SELECT 1
       FROM information_schema.columns
      WHERE table_schema='comind'
        AND table_name='cm_archive_import'
        AND column_name=required
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PFC-A01 missing archive-import lineage columns: %', v_missing;
  END IF;
END
$$;

DO $$
DECLARE
  v_status_check text;
  v_identity text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_status_check
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='comind'
     AND t.relname='cm_archive_import'
     AND c.conname='cm_archive_import_status_check';
  IF v_status_check IS NULL OR position('ABANDONED' in v_status_check)=0 THEN
    RAISE EXCEPTION 'PFC-A01 status constraint does not include ABANDONED: %', v_status_check;
  END IF;

  SELECT pg_get_constraintdef(c.oid)
    INTO v_identity
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='comind'
     AND t.relname='cm_archive_import'
     AND c.conname='cm_archive_import_attempt_identity';
  IF v_identity IS NULL
     OR position('source_archive_id' in v_identity)=0
     OR position('parser_version' in v_identity)=0
     OR position('schema_version' in v_identity)=0
     OR position('attempt_number' in v_identity)=0 THEN
    RAISE EXCEPTION 'PFC-A01 attempt identity constraint is incomplete: %', v_identity;
  END IF;
END
$$;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required)
    INTO v_missing
    FROM unnest(ARRAY[
      'cm_archive_import_attempt_number_check',
      'cm_archive_import_predecessor_fk',
      'cm_archive_import_root_fk',
      'cm_archive_import_recovery_lineage_shape',
      'cm_archive_import_not_own_predecessor',
      'cm_archive_import_not_own_root'
    ]) required
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='comind'
        AND t.relname='cm_archive_import'
        AND c.conname=required
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PFC-A01 missing lineage constraints: %', v_missing;
  END IF;
END
$$;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required)
    INTO v_missing
    FROM unnest(ARRAY[
      'uq_cm_archive_import_one_successor',
      'idx_cm_archive_import_identity_latest'
    ]) required
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_indexes
      WHERE schemaname='comind'
        AND tablename='cm_archive_import'
        AND indexname=required
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PFC-A01 missing lineage indexes: %', v_missing;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('comind.cm_guard_archive_import_lineage()') IS NULL THEN
    RAISE EXCEPTION 'PFC-A01 lineage guard function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger tr
      JOIN pg_class t ON t.oid=tr.tgrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='comind'
       AND t.relname='cm_archive_import'
       AND tr.tgname='trg_cm_archive_import_lineage'
       AND NOT tr.tgisinternal
  ) THEN
    RAISE EXCEPTION 'PFC-A01 lineage trigger is missing';
  END IF;
END
$$;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      IF has_function_privilege(v_role,'comind.cm_guard_archive_import_lineage()','EXECUTE') THEN
        RAISE EXCEPTION 'Role % can directly execute PFC-A01 lineage trigger helper', v_role;
      END IF;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='comind.cm_guard_archive_import_lineage()'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC can execute recovery helper';
  END IF;
  -- Recovery must not widen immutable source/evidence mutation authority.
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_source',
    'cm_archive_source_file',
    'cm_archive_conversation_observation',
    'cm_archive_node_observation',
    'cm_archive_attachment_reference',
    'cm_archive_parser_event',
    'cm_archive_quarantine'
  ]
  LOOP
    IF has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'DELETE')
       OR has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'TRUNCATE') THEN
      RAISE EXCEPTION 'PFC-A01 widened destructive/mutation authority on comind.%', v_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('comind_archive_ingestor','comind.cm_archive_import','UPDATE') THEN
    RAISE EXCEPTION 'PFC-A01 recovery requires existing bounded import-header UPDATE authority';
  END IF;
  IF has_table_privilege('comind_archive_ingestor','comind.cm_archive_import','DELETE')
     OR has_table_privilege('comind_archive_ingestor','comind.cm_archive_import','TRUNCATE') THEN
    RAISE EXCEPTION 'PFC-A01 archive ingestor has destructive import-header authority';
  END IF;
END
$$;

-- Exercise lineage constraints using the constrained archive role only.
SET ROLE comind_archive_ingestor;
DO $$
DECLARE
  v_source uuid;
  v_first uuid;
  v_second uuid;
BEGIN
  INSERT INTO comind.cm_archive_source (
    source_archive_name,source_archive_sha256,source_archive_bytes
  ) VALUES ('pfc-a01-verifier.zip',repeat('7',64),7)
  ON CONFLICT (source_system,source_archive_sha256) DO NOTHING;

  SELECT source_archive_id INTO v_source
    FROM comind.cm_archive_source
   WHERE source_system='chatgpt' AND source_archive_sha256=repeat('7',64);

  INSERT INTO comind.cm_archive_import (
    source_archive_id,parser_version,schema_version,attempt_number
  ) VALUES (v_source,'pfc-a01-verifier','pfc-a01-verifier',1)
  ON CONFLICT (source_archive_id,parser_version,schema_version,attempt_number) DO NOTHING;

  SELECT import_id INTO v_first
    FROM comind.cm_archive_import
   WHERE source_archive_id=v_source
     AND parser_version='pfc-a01-verifier'
     AND schema_version='pfc-a01-verifier'
     AND attempt_number=1;

  IF (SELECT status FROM comind.cm_archive_import WHERE import_id=v_first)='PENDING' THEN
    UPDATE comind.cm_archive_import
       SET status='ABANDONED',
           completed_at=now(),
           reconciliation='{"pfc_a01_verifier":true,"completeImportClaimed":false}'::jsonb,
           receipt='{"status":"ABANDONED","pfc_a01_verifier":true,"sourceEvidencePreserved":true,"deletionPerformed":false}'::jsonb,
           receipt_sha256=repeat('6',64)
     WHERE import_id=v_first;
  END IF;

  INSERT INTO comind.cm_archive_import (
    source_archive_id,parser_version,schema_version,attempt_number,
    predecessor_import_id,root_import_id,recovery_reason
  ) VALUES (
    v_source,'pfc-a01-verifier','pfc-a01-verifier',2,
    v_first,v_first,'isolated lineage verifier'
  )
  ON CONFLICT (source_archive_id,parser_version,schema_version,attempt_number) DO NOTHING;

  SELECT import_id INTO v_second
    FROM comind.cm_archive_import
   WHERE source_archive_id=v_source
     AND parser_version='pfc-a01-verifier'
     AND schema_version='pfc-a01-verifier'
     AND attempt_number=2;

  IF v_second IS NULL THEN
    RAISE EXCEPTION 'PFC-A01 verifier could not create successor attempt';
  END IF;

  BEGIN
    INSERT INTO comind.cm_archive_import (
      source_archive_id,parser_version,schema_version,attempt_number,
      predecessor_import_id,root_import_id,recovery_reason
    ) VALUES (
      v_source,'pfc-a01-verifier','pfc-a01-verifier',3,
      v_first,v_first,'competing successor must fail'
    );
    RAISE EXCEPTION 'PFC-A01 allowed competing successor for one predecessor';
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM <> 'archive retry attempt number must follow predecessor' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE comind.cm_archive_import SET recovery_reason='mutated' WHERE import_id=v_second;
    RAISE EXCEPTION 'PFC-A01 allowed lineage mutation after creation';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM='PFC-A01 allowed lineage mutation after creation' THEN RAISE; END IF;
  END;
END
$$;
RESET ROLE;

SELECT 'PFC-A01 archive import recovery verification: PASS' AS result;
