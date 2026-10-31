DO $$
DECLARE
  missing_columns text[];
  direct_public_privileges integer;
BEGIN
  SELECT array_agg(expected.column_name ORDER BY expected.column_name)
    INTO missing_columns
  FROM (
    VALUES
      ('publisher'),('document_identifier'),('source_kind'),('authority_level'),
      ('lifecycle_status'),('version_label'),('published_on'),('drive_file_id'),
      ('drive_url'),('drive_folder_id'),('mime_type'),('byte_size'),
      ('content_sha256'),('observed_fingerprint'),('fingerprint_algorithm'),
      ('ingested_at'),('last_verified_at'),('freshness_due_at'),
      ('superseded_by_ref_id'),('research_session_id'),('source_link_id'),
      ('related_capabilities'),('metadata')
  ) AS expected(column_name)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'comind'
   AND c.table_name = 'cm_research_refs'
   AND c.column_name = expected.column_name
  WHERE c.column_name IS NULL;

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'RLIB-001 missing cm_research_refs columns: %', missing_columns;
  END IF;

  IF to_regclass('comind.cm_learning_path') IS NULL THEN
    RAISE EXCEPTION 'RLIB-001 missing comind.cm_learning_path';
  END IF;

  IF to_regclass('comind.cm_learning_path_item') IS NULL THEN
    RAISE EXCEPTION 'RLIB-001 missing comind.cm_learning_path_item';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'comind.cm_research_refs'::regclass
      AND conname = 'cm_research_refs_superseded_by_fk'
  ) THEN
    RAISE EXCEPTION 'RLIB-001 missing supersession foreign key';
  END IF;

  IF to_regclass('comind_pm.pm_research_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'comind.cm_research_refs'::regclass
         AND conname = 'cm_research_refs_research_session_fk'
     ) THEN
    RAISE EXCEPTION 'RLIB-001 missing governed research-session lineage foreign key';
  END IF;

  IF to_regclass('comind_pm.pm_links') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'comind.cm_research_refs'::regclass
         AND conname = 'cm_research_refs_source_link_fk'
     ) THEN
    RAISE EXCEPTION 'RLIB-001 missing write-through source-link lineage foreign key';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'comind'
      AND tablename = 'cm_research_refs'
      AND indexname = 'cm_research_refs_drive_file_uidx'
  ) THEN
    RAISE EXCEPTION 'RLIB-001 missing unique Drive file identity index';
  END IF;

  SELECT count(*)
    INTO direct_public_privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'comind'
    AND table_name IN ('cm_research_refs', 'cm_learning_path', 'cm_learning_path_item')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');

  IF direct_public_privileges <> 0 THEN
    RAISE EXCEPTION 'RLIB-001 found unexpected direct browser/public grants: %', direct_public_privileges;
  END IF;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_research_refs(title, url, content_sha256)
    VALUES ('RLIB verifier invalid hash', 'https://example.invalid/rlib-invalid-hash', 'not-a-hash');
    RAISE EXCEPTION 'RLIB-001 content SHA constraint did not reject an invalid value';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END
$$;

DO $$
DECLARE
  old_id uuid;
  new_id uuid;
BEGIN
  INSERT INTO comind.cm_research_refs(
    title, url, publisher, document_identifier, source_kind,
    authority_level, lifecycle_status, version_label
  ) VALUES (
    'RLIB verifier draft',
    'https://example.invalid/rlib-draft',
    'RLIB verifier',
    'RLIB-VERIFY-001',
    'draft',
    'primary_authoritative',
    'withdrawn',
    'draft'
  ) RETURNING ref_id INTO old_id;

  INSERT INTO comind.cm_research_refs(
    title, url, publisher, document_identifier, source_kind,
    authority_level, lifecycle_status, version_label
  ) VALUES (
    'RLIB verifier final',
    'https://example.invalid/rlib-final',
    'RLIB verifier',
    'RLIB-VERIFY-001',
    'profile',
    'primary_authoritative',
    'current',
    'final'
  ) RETURNING ref_id INTO new_id;

  UPDATE comind.cm_research_refs
  SET superseded_by_ref_id = new_id
  WHERE ref_id = old_id;

  IF NOT EXISTS (
    SELECT 1
    FROM comind.cm_research_refs
    WHERE ref_id = old_id
      AND lifecycle_status = 'withdrawn'
      AND superseded_by_ref_id = new_id
  ) THEN
    RAISE EXCEPTION 'RLIB-001 supersession relationship verification failed';
  END IF;

  DELETE FROM comind.cm_research_refs WHERE ref_id IN (old_id, new_id);
END
$$;
