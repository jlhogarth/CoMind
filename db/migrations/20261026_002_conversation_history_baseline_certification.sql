-- CHIST-001: explicit certification boundary between a technically PASS archive import
-- and an authorized real Conversation History baseline.
-- A PASS parser/integrity receipt alone is never sufficient to claim real history.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_conversation_history_certifier') THEN
    CREATE ROLE comind_conversation_history_certifier
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_conversation_history_certifier
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comind.cm_conversation_history_baseline (
  baseline_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL UNIQUE REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_archive_id uuid NOT NULL REFERENCES comind.cm_archive_source(source_archive_id) ON DELETE RESTRICT,
  source_archive_sha256 char(64) NOT NULL CHECK (source_archive_sha256 ~ '^[a-f0-9]{64}$'),
  certification_version text NOT NULL CHECK (length(btrim(certification_version)) > 0),
  source_kind text NOT NULL DEFAULT 'native_openai_export'
    CHECK (source_kind = 'native_openai_export'),
  certified_by text NOT NULL CHECK (length(btrim(certified_by)) > 0),
  certification_reason text NOT NULL CHECK (length(btrim(certification_reason)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  certification_sha256 char(64) NOT NULL UNIQUE CHECK (certification_sha256 ~ '^[a-f0-9]{64}$'),
  certified_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION comind.cm_guard_conversation_history_baseline_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_status text;
  v_source_archive_id uuid;
  v_source_system text;
  v_source_archive_sha256 char(64);
BEGIN
  SELECT i.status, i.source_archive_id, s.source_system, s.source_archive_sha256
    INTO v_status, v_source_archive_id, v_source_system, v_source_archive_sha256
    FROM comind.cm_archive_import i
    JOIN comind.cm_archive_source s USING (source_archive_id)
   WHERE i.import_id = NEW.import_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation History baseline import does not exist';
  END IF;
  IF v_status <> 'PASS' THEN
    RAISE EXCEPTION 'Conversation History baseline requires a PASS archive import';
  END IF;
  IF v_source_system <> 'chatgpt' THEN
    RAISE EXCEPTION 'Conversation History baseline requires ChatGPT source evidence';
  END IF;
  IF NEW.source_archive_id <> v_source_archive_id THEN
    RAISE EXCEPTION 'Conversation History baseline source archive does not match import';
  END IF;
  IF NEW.source_archive_sha256 <> v_source_archive_sha256 THEN
    RAISE EXCEPTION 'Conversation History baseline archive digest does not match source evidence';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_conversation_history_baseline_guard
  ON comind.cm_conversation_history_baseline;
CREATE TRIGGER trg_cm_conversation_history_baseline_guard
BEFORE INSERT ON comind.cm_conversation_history_baseline
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_conversation_history_baseline_insert();

DROP TRIGGER IF EXISTS trg_cm_conversation_history_baseline_immutable
  ON comind.cm_conversation_history_baseline;
CREATE TRIGGER trg_cm_conversation_history_baseline_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_history_baseline
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

ALTER TABLE comind.cm_conversation_history_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_history_baseline FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA comind TO comind_conversation_history_certifier;
GRANT comind_conversation_history_certifier TO CURRENT_USER;
GRANT SELECT ON TABLE comind.cm_archive_source, comind.cm_archive_import
  TO comind_conversation_history_certifier;
GRANT SELECT, INSERT ON TABLE comind.cm_conversation_history_baseline
  TO comind_conversation_history_certifier;
GRANT SELECT ON TABLE comind.cm_conversation_history_baseline
  TO comind_conversation_history_reader;

DROP POLICY IF EXISTS cm_conversation_history_certifier_select
  ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_conversation_history_certifier_select
  ON comind.cm_conversation_history_baseline
  FOR SELECT TO comind_conversation_history_certifier USING (true);
DROP POLICY IF EXISTS cm_conversation_history_certifier_insert
  ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_conversation_history_certifier_insert
  ON comind.cm_conversation_history_baseline
  FOR INSERT TO comind_conversation_history_certifier WITH CHECK (true);
DROP POLICY IF EXISTS cm_conversation_history_reader_select
  ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_conversation_history_reader_select
  ON comind.cm_conversation_history_baseline
  FOR SELECT TO comind_conversation_history_reader USING (true);

REVOKE ALL ON TABLE comind.cm_conversation_history_baseline FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor','comind_conversation_reconciler','comind_conversation_deriver']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_history_baseline FROM %I', v_role);
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_conversation_history_baseline_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_guard_conversation_history_baseline_insert()
  TO comind_conversation_history_certifier;
REVOKE EXECUTE ON FUNCTION comind.cm_guard_conversation_history_baseline_insert()
  FROM comind_conversation_history_reader;

COMMENT ON TABLE comind.cm_conversation_history_baseline IS
  'CHIST-001 immutable certification that one PASS ChatGPT archive import is an authorized native OpenAI export baseline. Parser PASS alone never establishes this status.';
COMMENT ON ROLE comind_conversation_history_certifier IS
  'CHIST-001 NOLOGIN/NOINHERIT append-only authority for certifying reviewed native OpenAI export imports as Conversation History baselines.';

COMMIT;
