-- Issue #250: recovery/access hardening for differential archive attempts.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_import_lineage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_predecessor comind.cm_archive_import%ROWTYPE;
  v_expected_root uuid;
BEGIN
  IF NEW.attempt_number = 1 THEN
    IF NEW.predecessor_import_id IS NOT NULL
       OR NEW.root_import_id IS NOT NULL
       OR NEW.recovery_reason IS NOT NULL THEN
      RAISE EXCEPTION 'first archive import attempt cannot declare recovery lineage';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.predecessor_import_id IS NULL
     OR NEW.root_import_id IS NULL
     OR NEW.recovery_reason IS NULL
     OR btrim(NEW.recovery_reason) = '' THEN
    RAISE EXCEPTION 'archive retry attempt requires predecessor, root, and recovery reason';
  END IF;

  SELECT * INTO v_predecessor
  FROM comind.cm_archive_import
  WHERE import_id = NEW.predecessor_import_id
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'archive retry predecessor % does not exist', NEW.predecessor_import_id; END IF;
  IF v_predecessor.status <> 'ABANDONED' THEN
    RAISE EXCEPTION 'archive retry predecessor % must be ABANDONED, found %', NEW.predecessor_import_id, v_predecessor.status;
  END IF;
  IF NEW.source_archive_id <> v_predecessor.source_archive_id
     OR NEW.parser_version <> v_predecessor.parser_version
     OR NEW.schema_version <> v_predecessor.schema_version THEN
    RAISE EXCEPTION 'archive retry must preserve source/parser/schema identity';
  END IF;
  IF NEW.attempt_number <> v_predecessor.attempt_number + 1 THEN
    RAISE EXCEPTION 'archive retry attempt number must follow predecessor';
  END IF;

  v_expected_root := COALESCE(v_predecessor.root_import_id, v_predecessor.import_id);
  IF NEW.root_import_id <> v_expected_root THEN RAISE EXCEPTION 'archive retry root does not match predecessor lineage'; END IF;

  -- Recovery callers written before differential ingestion do not need to know
  -- about import_mode. The database preserves it as lineage identity.
  NEW.import_mode := v_predecessor.import_mode;
  RETURN NEW;
END;
$$;

-- Differential checkpoint establishment must be able to inspect only the
-- immutable certification anchor. It receives no certification write authority.
GRANT SELECT ON TABLE comind.cm_conversation_history_baseline TO comind_archive_ingestor;
DROP POLICY IF EXISTS cm_archive_ingestor_select ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_archive_ingestor_select
  ON comind.cm_conversation_history_baseline
  FOR SELECT TO comind_archive_ingestor USING (true);

REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_lineage() FROM comind_archive_ingestor;

COMMIT;
