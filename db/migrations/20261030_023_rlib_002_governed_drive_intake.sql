BEGIN;

SET search_path TO comind, comind_pm, public;

CREATE TABLE IF NOT EXISTS comind.cm_research_intake_source (
  source_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  drive_folder_id text NOT NULL UNIQUE,
  drive_url text NOT NULL,
  default_destination_folder_id text,
  default_destination_url text,
  environment text NOT NULL DEFAULT 'Test'
    CHECK (environment IN ('Test','Production')),
  production boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  automation_allowed boolean NOT NULL DEFAULT false,
  poll_interval_minutes integer NOT NULL DEFAULT 60
    CHECK (poll_interval_minutes >= 60),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE comind.cm_research_intake_source IS
  'Bounded Drive folders authorized as governed Research Library intake sources. Production remains independently governed.';

CREATE TABLE IF NOT EXISTS comind.cm_research_intake (
  intake_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES comind.cm_research_intake_source(source_id),
  drive_file_id text NOT NULL UNIQUE,
  drive_url text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
  observed_created_at timestamptz,
  observed_modified_at timestamptz,
  content_sha256 char(64)
    CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  fingerprint_algorithm text,
  fingerprint_status text NOT NULL DEFAULT 'pending'
    CHECK (fingerprint_status IN ('pending','verified','unavailable','failed')),
  duplicate_of_ref_id uuid REFERENCES comind.cm_research_refs(ref_id),
  version_candidate_of_ref_id uuid REFERENCES comind.cm_research_refs(ref_id),
  version_assessment text NOT NULL DEFAULT 'not_assessed'
    CHECK (version_assessment IN (
      'not_assessed','exact_duplicate','no_match','potential_newer',
      'potential_older','parallel_variant','ambiguous'
    )),
  proposed_source_kind text,
  proposed_authority_level text,
  proposed_lifecycle_status text,
  proposed_tags text[] NOT NULL DEFAULT '{}'::text[],
  proposed_related_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  proposed_destination_folder_id text,
  classification_confidence numeric(5,4)
    CHECK (classification_confidence IS NULL OR (classification_confidence >= 0 AND classification_confidence <= 1)),
  classification_basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN (
      'detected','fingerprinted','exact_duplicate','classification_proposed',
      'ready_to_move','moved','blocked','rejected','failed','cleaned_up'
    )),
  blocked_reason text,
  research_session_id uuid REFERENCES comind_pm.pm_research_sessions(id),
  source_link_id uuid REFERENCES comind_pm.pm_links(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  fingerprinted_at timestamptz,
  classified_at timestamptz,
  moved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE comind.cm_research_intake IS
  'Governed candidate-file state for Drive research intake. Exact duplicate is a cryptographic byte-equality determination; version relationships require separate evidence.';
COMMENT ON COLUMN comind.cm_research_intake.content_sha256 IS
  'SHA-256 of original file bytes only. Drive ID, byte size, extracted text, or semantic similarity must never populate this column.';
COMMENT ON COLUMN comind.cm_research_intake.version_assessment IS
  'Semantic/version assessment separate from byte fingerprinting. A different hash never proves a newer version.';

CREATE TABLE IF NOT EXISTS comind.cm_research_intake_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES comind.cm_research_intake(intake_id),
  event_type text NOT NULL
    CHECK (event_type IN (
      'detected','redetected','fingerprint_verified','fingerprint_unavailable',
      'fingerprint_failed','exact_duplicate_found','no_exact_duplicate',
      'version_candidate_proposed','classification_proposed','ready_to_move',
      'moved','blocked','rejected','failed','cleaned_up'
    )),
  actor text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE comind.cm_research_intake_event IS
  'Append-only intake lifecycle evidence. Events preserve detection, fingerprint, assessment, classification, movement, blocking, and failure history.';

CREATE INDEX IF NOT EXISTS cm_research_intake_status_idx
  ON comind.cm_research_intake(status, detected_at);
CREATE INDEX IF NOT EXISTS cm_research_intake_sha256_idx
  ON comind.cm_research_intake(content_sha256)
  WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_intake_duplicate_idx
  ON comind.cm_research_intake(duplicate_of_ref_id)
  WHERE duplicate_of_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_intake_event_intake_idx
  ON comind.cm_research_intake_event(intake_id, created_at);

CREATE OR REPLACE FUNCTION comind.set_updated_at_research_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_research_intake_source_updated ON comind.cm_research_intake_source;
CREATE TRIGGER trg_cm_research_intake_source_updated
BEFORE UPDATE ON comind.cm_research_intake_source
FOR EACH ROW EXECUTE FUNCTION comind.set_updated_at_research_intake();

DROP TRIGGER IF EXISTS trg_cm_research_intake_updated ON comind.cm_research_intake;
CREATE TRIGGER trg_cm_research_intake_updated
BEFORE UPDATE ON comind.cm_research_intake
FOR EACH ROW EXECUTE FUNCTION comind.set_updated_at_research_intake();

CREATE OR REPLACE FUNCTION comind.reject_research_intake_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'cm_research_intake_event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_research_intake_event_immutable ON comind.cm_research_intake_event;
CREATE TRIGGER trg_cm_research_intake_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_research_intake_event
FOR EACH ROW EXECUTE FUNCTION comind.reject_research_intake_event_mutation();

CREATE OR REPLACE FUNCTION comind.register_research_intake_detection(
  p_source_key text,
  p_drive_file_id text,
  p_drive_url text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_observed_created_at timestamptz,
  p_observed_modified_at timestamptz,
  p_actor text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, comind_pm, public, pg_temp
AS $$
DECLARE
  v_source_id uuid;
  v_intake_id uuid;
  v_inserted boolean := false;
BEGIN
  SELECT source_id INTO v_source_id
  FROM comind.cm_research_intake_source
  WHERE source_key = p_source_key
    AND enabled = true;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'research intake source is missing or disabled: %', p_source_key;
  END IF;

  INSERT INTO comind.cm_research_intake(
    source_id, drive_file_id, drive_url, file_name, mime_type, byte_size,
    observed_created_at, observed_modified_at
  ) VALUES (
    v_source_id, p_drive_file_id, p_drive_url, p_file_name, p_mime_type, p_byte_size,
    p_observed_created_at, p_observed_modified_at
  )
  ON CONFLICT (drive_file_id) DO NOTHING
  RETURNING intake_id INTO v_intake_id;

  IF v_intake_id IS NOT NULL THEN
    v_inserted := true;
  ELSE
    SELECT intake_id INTO v_intake_id
    FROM comind.cm_research_intake
    WHERE drive_file_id = p_drive_file_id;

    UPDATE comind.cm_research_intake
    SET drive_url = p_drive_url,
        file_name = p_file_name,
        mime_type = p_mime_type,
        byte_size = p_byte_size,
        observed_created_at = COALESCE(p_observed_created_at, observed_created_at),
        observed_modified_at = COALESCE(p_observed_modified_at, observed_modified_at)
    WHERE intake_id = v_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (
    v_intake_id,
    CASE WHEN v_inserted THEN 'detected' ELSE 'redetected' END,
    p_actor,
    jsonb_build_object(
      'drive_file_id', p_drive_file_id,
      'file_name', p_file_name,
      'byte_size', p_byte_size
    )
  );

  RETURN v_intake_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.record_research_intake_fingerprint(
  p_intake_id uuid,
  p_sha256 text,
  p_actor text
)
RETURNS TABLE(intake_id uuid, status text, duplicate_of_ref_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
  v_duplicate uuid;
BEGIN
  IF p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'raw SHA-256 must be 64 lowercase hexadecimal characters';
  END IF;

  SELECT ref_id INTO v_duplicate
  FROM comind.cm_research_refs
  WHERE content_sha256 = p_sha256
  ORDER BY
    CASE lifecycle_status WHEN 'current' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END,
    created_at
  LIMIT 1;

  UPDATE comind.cm_research_intake i
  SET content_sha256 = p_sha256,
      fingerprint_algorithm = 'sha256:raw-bytes',
      fingerprint_status = 'verified',
      fingerprinted_at = now(),
      duplicate_of_ref_id = v_duplicate,
      version_assessment = CASE WHEN v_duplicate IS NULL THEN 'no_match' ELSE 'exact_duplicate' END,
      status = CASE WHEN v_duplicate IS NULL THEN 'fingerprinted' ELSE 'exact_duplicate' END,
      blocked_reason = NULL
  WHERE i.intake_id = p_intake_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research intake item not found: %', p_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (
    p_intake_id,
    'fingerprint_verified',
    p_actor,
    jsonb_build_object('sha256',p_sha256,'algorithm','sha256:raw-bytes')
  );

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (
    p_intake_id,
    CASE WHEN v_duplicate IS NULL THEN 'no_exact_duplicate' ELSE 'exact_duplicate_found' END,
    p_actor,
    jsonb_build_object('duplicate_of_ref_id',v_duplicate)
  );

  RETURN QUERY
  SELECT i.intake_id, i.status, i.duplicate_of_ref_id
  FROM comind.cm_research_intake i
  WHERE i.intake_id = p_intake_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.mark_research_intake_fingerprint_unavailable(
  p_intake_id uuid,
  p_reason text,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  UPDATE comind.cm_research_intake
  SET fingerprint_status = 'unavailable',
      status = 'blocked',
      blocked_reason = p_reason
  WHERE intake_id = p_intake_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research intake item not found: %', p_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (p_intake_id,'fingerprint_unavailable',p_actor,jsonb_build_object('reason',p_reason));
  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (p_intake_id,'blocked',p_actor,jsonb_build_object('reason',p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION comind.propose_research_intake_classification(
  p_intake_id uuid,
  p_source_kind text,
  p_authority_level text,
  p_lifecycle_status text,
  p_tags text[],
  p_related_capabilities text[],
  p_destination_folder_id text,
  p_confidence numeric,
  p_basis jsonb,
  p_version_assessment text,
  p_version_candidate_of_ref_id uuid,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM comind.cm_research_intake
  WHERE intake_id = p_intake_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'research intake item not found: %', p_intake_id;
  END IF;

  IF v_status = 'exact_duplicate' THEN
    RAISE EXCEPTION 'exact duplicate cannot be promoted as a new canonical research record';
  END IF;

  IF v_status NOT IN ('fingerprinted','classification_proposed','blocked') THEN
    RAISE EXCEPTION 'classification requires a successfully fingerprinted non-duplicate item; status=%', v_status;
  END IF;

  IF p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'classification confidence must be between 0 and 1';
  END IF;

  IF p_version_assessment NOT IN ('no_match','potential_newer','potential_older','parallel_variant','ambiguous') THEN
    RAISE EXCEPTION 'invalid version assessment for classification: %', p_version_assessment;
  END IF;

  IF p_version_assessment IN ('potential_newer','potential_older','parallel_variant','ambiguous')
     AND p_version_candidate_of_ref_id IS NULL THEN
    RAISE EXCEPTION 'version candidate reference is required for assessment %', p_version_assessment;
  END IF;

  UPDATE comind.cm_research_intake
  SET proposed_source_kind = p_source_kind,
      proposed_authority_level = p_authority_level,
      proposed_lifecycle_status = p_lifecycle_status,
      proposed_tags = COALESCE(p_tags,'{}'::text[]),
      proposed_related_capabilities = COALESCE(p_related_capabilities,'{}'::text[]),
      proposed_destination_folder_id = p_destination_folder_id,
      classification_confidence = p_confidence,
      classification_basis = COALESCE(p_basis,'{}'::jsonb),
      version_assessment = p_version_assessment,
      version_candidate_of_ref_id = p_version_candidate_of_ref_id,
      status = 'classification_proposed',
      classified_at = now(),
      blocked_reason = NULL
  WHERE intake_id = p_intake_id;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (
    p_intake_id,'classification_proposed',p_actor,
    jsonb_build_object(
      'source_kind',p_source_kind,
      'authority_level',p_authority_level,
      'lifecycle_status',p_lifecycle_status,
      'destination_folder_id',p_destination_folder_id,
      'confidence',p_confidence,
      'version_assessment',p_version_assessment,
      'version_candidate_of_ref_id',p_version_candidate_of_ref_id,
      'basis',COALESCE(p_basis,'{}'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind.mark_research_intake_ready_to_move(
  p_intake_id uuid,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  UPDATE comind.cm_research_intake
  SET status = 'ready_to_move'
  WHERE intake_id = p_intake_id
    AND status = 'classification_proposed'
    AND fingerprint_status = 'verified'
    AND duplicate_of_ref_id IS NULL
    AND proposed_destination_folder_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research intake item is not eligible to move: %', p_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (p_intake_id,'ready_to_move',p_actor,'{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION comind.mark_research_intake_moved(
  p_intake_id uuid,
  p_destination_folder_id text,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  UPDATE comind.cm_research_intake
  SET status = 'moved',
      moved_at = now(),
      metadata = metadata || jsonb_build_object('actual_destination_folder_id',p_destination_folder_id)
  WHERE intake_id = p_intake_id
    AND status = 'ready_to_move'
    AND proposed_destination_folder_id = p_destination_folder_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research intake move does not match an approved destination: %', p_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (p_intake_id,'moved',p_actor,jsonb_build_object('destination_folder_id',p_destination_folder_id));
END;
$$;

CREATE OR REPLACE FUNCTION comind.block_research_intake(
  p_intake_id uuid,
  p_reason text,
  p_actor text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  UPDATE comind.cm_research_intake
  SET status = 'blocked', blocked_reason = p_reason
  WHERE intake_id = p_intake_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'research intake item not found: %', p_intake_id;
  END IF;

  INSERT INTO comind.cm_research_intake_event(intake_id,event_type,actor,detail)
  VALUES (p_intake_id,'blocked',p_actor,jsonb_build_object('reason',p_reason));
END;
$$;

INSERT INTO comind.cm_research_intake_source(
  source_key, display_name, drive_folder_id, drive_url,
  default_destination_folder_id, default_destination_url,
  environment, production, enabled, automation_allowed, poll_interval_minutes, metadata
) VALUES (
  'saved-from-chrome',
  'Saved from Chrome Research Intake',
  '18I-qJ-MW40PybsxIkMbVo_hibh-3LgxG',
  'https://drive.google.com/drive/folders/18I-qJ-MW40PybsxIkMbVo_hibh-3LgxG',
  '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz',
  'https://drive.google.com/drive/folders/1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz',
  'Test', false, true, true, 60,
  jsonb_build_object(
    'governing_issue','https://github.com/jlhogarth/CoMind/issues/362',
    'production_activation',false,
    'classification_rule','ambiguous classification fails closed',
    'fingerprint_rule','raw file bytes SHA-256 required for exact duplicate determination'
  )
)
ON CONFLICT (source_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  drive_folder_id = EXCLUDED.drive_folder_id,
  drive_url = EXCLUDED.drive_url,
  default_destination_folder_id = EXCLUDED.default_destination_folder_id,
  default_destination_url = EXCLUDED.default_destination_url,
  environment = EXCLUDED.environment,
  production = EXCLUDED.production,
  enabled = EXCLUDED.enabled,
  automation_allowed = EXCLUDED.automation_allowed,
  poll_interval_minutes = EXCLUDED.poll_interval_minutes,
  metadata = EXCLUDED.metadata;

REVOKE ALL ON TABLE comind.cm_research_intake_source FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_research_intake FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_research_intake_event FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION comind.set_updated_at_research_intake() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.reject_research_intake_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.register_research_intake_detection(text,text,text,text,text,bigint,timestamptz,timestamptz,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.record_research_intake_fingerprint(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.mark_research_intake_fingerprint_unavailable(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.propose_research_intake_classification(uuid,text,text,text,text[],text[],text,numeric,jsonb,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.mark_research_intake_ready_to_move(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.mark_research_intake_moved(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.block_research_intake(uuid,text,text) FROM PUBLIC, anon, authenticated;

COMMIT;
