-- PFC-A01 / Issue #241: append-only ChatGPT archive import interruption recovery.
-- Repository / isolated PostgreSQL proof only until separately authorized for Supabase Test.
BEGIN;

ALTER TABLE comind.cm_archive_import
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS predecessor_import_id uuid,
  ADD COLUMN IF NOT EXISTS root_import_id uuid,
  ADD COLUMN IF NOT EXISTS recovery_reason text;

ALTER TABLE comind.cm_archive_import
  DROP CONSTRAINT IF EXISTS cm_archive_import_status_check,
  DROP CONSTRAINT IF EXISTS cm_archive_import_attempt_identity;

ALTER TABLE comind.cm_archive_import
  ADD CONSTRAINT cm_archive_import_status_check
    CHECK (status IN ('PENDING', 'PASS', 'WARN', 'FAIL', 'ABANDONED')),
  ADD CONSTRAINT cm_archive_import_attempt_number_check
    CHECK (attempt_number > 0),
  ADD CONSTRAINT cm_archive_import_predecessor_fk
    FOREIGN KEY (predecessor_import_id)
    REFERENCES comind.cm_archive_import(import_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT cm_archive_import_root_fk
    FOREIGN KEY (root_import_id)
    REFERENCES comind.cm_archive_import(import_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT cm_archive_import_recovery_lineage_shape CHECK (
    (attempt_number = 1
      AND predecessor_import_id IS NULL
      AND root_import_id IS NULL
      AND recovery_reason IS NULL)
    OR
    (attempt_number > 1
      AND predecessor_import_id IS NOT NULL
      AND root_import_id IS NOT NULL
      AND recovery_reason IS NOT NULL
      AND btrim(recovery_reason) <> '')
  ),
  ADD CONSTRAINT cm_archive_import_not_own_predecessor CHECK (
    predecessor_import_id IS NULL OR predecessor_import_id <> import_id
  ),
  ADD CONSTRAINT cm_archive_import_not_own_root CHECK (
    root_import_id IS NULL OR root_import_id <> import_id
  ),
  ADD CONSTRAINT cm_archive_import_attempt_identity
    UNIQUE (source_archive_id, parser_version, schema_version, attempt_number);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_archive_import_one_successor
  ON comind.cm_archive_import(predecessor_import_id)
  WHERE predecessor_import_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_archive_import_identity_latest
  ON comind.cm_archive_import(source_archive_id, parser_version, schema_version, attempt_number DESC);

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'archive retry predecessor % does not exist', NEW.predecessor_import_id;
  END IF;

  IF v_predecessor.status <> 'ABANDONED' THEN
    RAISE EXCEPTION 'archive retry predecessor % must be ABANDONED, found %',
      NEW.predecessor_import_id, v_predecessor.status;
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
  IF NEW.root_import_id <> v_expected_root THEN
    RAISE EXCEPTION 'archive retry root does not match predecessor lineage';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_import_lineage ON comind.cm_archive_import;
CREATE TRIGGER trg_cm_archive_import_lineage
BEFORE INSERT ON comind.cm_archive_import
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_import_lineage();

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_import_finalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'archive import attempts are immutable';
  END IF;

  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'finalized archive import attempts are immutable';
  END IF;

  IF NEW.source_archive_id <> OLD.source_archive_id
     OR NEW.parser_version <> OLD.parser_version
     OR NEW.schema_version <> OLD.schema_version
     OR NEW.started_at <> OLD.started_at
     OR NEW.attempt_number <> OLD.attempt_number
     OR NEW.predecessor_import_id IS DISTINCT FROM OLD.predecessor_import_id
     OR NEW.root_import_id IS DISTINCT FROM OLD.root_import_id
     OR NEW.recovery_reason IS DISTINCT FROM OLD.recovery_reason THEN
    RAISE EXCEPTION 'archive import identity and lineage fields are immutable';
  END IF;

  IF NEW.status = 'PENDING' THEN
    RAISE EXCEPTION 'archive import update must finalize the attempt';
  END IF;

  IF NEW.completed_at IS NULL OR NEW.receipt IS NULL OR NEW.receipt_sha256 IS NULL THEN
    RAISE EXCEPTION 'archive import finalization requires completion time and integrity receipt';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_lineage() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_lineage() FROM comind_archive_ingestor;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM comind_archive_ingestor;

COMMENT ON COLUMN comind.cm_archive_import.attempt_number IS
  'Monotonic attempt number for one immutable archive source/parser/schema identity. First attempt is 1.';
COMMENT ON COLUMN comind.cm_archive_import.predecessor_import_id IS
  'Immediate abandoned predecessor for an explicit recovery retry. Null on the first attempt.';
COMMENT ON COLUMN comind.cm_archive_import.root_import_id IS
  'Root attempt for retry lineage. Null on the first attempt, which is its own logical root.';
COMMENT ON COLUMN comind.cm_archive_import.recovery_reason IS
  'Operator/development recovery reason copied onto a successor retry attempt.';
COMMENT ON TABLE comind.cm_archive_import IS
  'Append-only parser/schema attempts against immutable archive sources. Interrupted attempts remain preserved; explicit recovery creates a new lineage-linked attempt.';

COMMIT;
