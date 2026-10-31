-- CFR-001G: governed analytics and intent derivation substrate
-- Test-first, additive, non-promoting analytical evidence layer.

BEGIN;
SET search_path TO comind, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_conversation_deriver') THEN
    CREATE ROLE comind_conversation_deriver NOLOGIN NOINHERIT;
  ELSE
    ALTER ROLE comind_conversation_deriver NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS cm_conversation_derivation_run (
  derivation_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  engine_kind text NOT NULL CHECK (engine_kind IN ('deterministic', 'model_assisted')),
  provider text,
  model text,
  prompt_template_sha256 char(64) CHECK (prompt_template_sha256 IS NULL OR prompt_template_sha256 ~ '^[a-f0-9]{64}$'),
  source_snapshot_sha256 char(64) NOT NULL CHECK (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  run_identity_sha256 char(64) NOT NULL UNIQUE CHECK (run_identity_sha256 ~ '^[a-f0-9]{64}$'),
  source_message_count integer NOT NULL CHECK (source_message_count >= 0),
  source_capture_event_count integer NOT NULL CHECK (source_capture_event_count >= 0),
  source_checkpoint_count integer NOT NULL CHECK (source_checkpoint_count >= 0),
  source_max_capture_sequence bigint NOT NULL DEFAULT 0 CHECK (source_max_capture_sequence >= 0),
  source_started_at timestamptz,
  source_ended_at timestamptz,
  result_state text NOT NULL DEFAULT 'completed' CHECK (result_state IN ('completed', 'partial')),
  source_stats jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_stats) = 'object'),
  engine_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(engine_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_derivation_engine_boundary CHECK (
    (engine_kind = 'deterministic' AND provider IS NULL AND model IS NULL AND prompt_template_sha256 IS NULL)
    OR
    (engine_kind = 'model_assisted' AND provider IS NOT NULL AND model IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS cm_conversation_derivation (
  derivation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  derivation_run_id uuid NOT NULL REFERENCES cm_conversation_derivation_run(derivation_run_id) ON DELETE RESTRICT,
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  msg_id uuid REFERENCES cm_message(msg_id) ON DELETE RESTRICT,
  checkpoint_id uuid REFERENCES cm_conversation_recovery_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  derivation_kind text NOT NULL CHECK (derivation_kind IN (
    'intent', 'topic', 'entity', 'decision_candidate', 'assumption', 'requirement',
    'open_question', 'commitment', 'unresolved_thread', 'architecture_relationship',
    'action_candidate', 'conflict_signal', 'salience_signal'
  )),
  source_kind text NOT NULL CHECK (source_kind IN ('canonical_message', 'live_partial', 'conversation_aggregate')),
  source_role text CHECK (source_role IS NULL OR source_role IN ('user', 'assistant', 'system', 'tool')),
  capture_sequence_start bigint CHECK (capture_sequence_start IS NULL OR capture_sequence_start >= 0),
  capture_sequence_end bigint CHECK (capture_sequence_end IS NULL OR capture_sequence_end >= 0),
  evidence_start_char integer CHECK (evidence_start_char IS NULL OR evidence_start_char >= 0),
  evidence_end_char integer CHECK (evidence_end_char IS NULL OR evidence_end_char >= 0),
  value_text text NOT NULL CHECK (length(btrim(value_text)) > 0),
  normalized_key text,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  salience numeric(5,4) NOT NULL CHECK (salience >= 0 AND salience <= 1),
  uncertainty text,
  conflict_state text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none', 'ambiguous', 'conflicting')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  derivation_sha256 char(64) NOT NULL CHECK (derivation_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_derivation_span_order CHECK (
    evidence_start_char IS NULL OR evidence_end_char IS NULL OR evidence_end_char >= evidence_start_char
  ),
  CONSTRAINT cm_conversation_derivation_capture_order CHECK (
    capture_sequence_start IS NULL OR capture_sequence_end IS NULL OR capture_sequence_end >= capture_sequence_start
  ),
  CONSTRAINT cm_conversation_derivation_source_reference CHECK (
    (source_kind = 'canonical_message' AND msg_id IS NOT NULL AND checkpoint_id IS NULL)
    OR
    (source_kind = 'live_partial' AND checkpoint_id IS NOT NULL AND msg_id IS NULL)
    OR
    (source_kind = 'conversation_aggregate' AND msg_id IS NULL AND checkpoint_id IS NULL)
  ),
  CONSTRAINT cm_conversation_derivation_run_hash_unique UNIQUE (derivation_run_id, derivation_sha256)
);

CREATE TABLE IF NOT EXISTS cm_conversation_promotion_candidate (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  derivation_run_id uuid NOT NULL REFERENCES cm_conversation_derivation_run(derivation_run_id) ON DELETE RESTRICT,
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  derivation_id uuid NOT NULL REFERENCES cm_conversation_derivation(derivation_id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN (
    'memory', 'rule', 'decision', 'assumption', 'open_question', 'task', 'architecture'
  )),
  proposed_title text NOT NULL CHECK (length(btrim(proposed_title)) > 0),
  proposed_content text NOT NULL CHECK (length(btrim(proposed_content)) > 0),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  salience numeric(5,4) NOT NULL CHECK (salience >= 0 AND salience <= 1),
  uncertainty text,
  conflict_state text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none', 'ambiguous', 'conflicting')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  candidate_sha256 char(64) NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_promotion_candidate_run_hash_unique UNIQUE (derivation_run_id, candidate_sha256)
);

ALTER TABLE cm_message_analytics
  ADD COLUMN IF NOT EXISTS derivation_run_id uuid REFERENCES cm_conversation_derivation_run(derivation_run_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_snapshot_sha256 char(64),
  ADD COLUMN IF NOT EXISTS char_count integer,
  ADD COLUMN IF NOT EXISTS word_count integer,
  ADD COLUMN IF NOT EXISTS sentence_count integer,
  ADD COLUMN IF NOT EXISTS question_count integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE cm_conversation_analytics
  ADD COLUMN IF NOT EXISTS derivation_run_id uuid REFERENCES cm_conversation_derivation_run(derivation_run_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_snapshot_sha256 char(64),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_message_analytics_msg_id
  ON cm_message_analytics (msg_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_conversation_analytics_conv_id
  ON cm_conversation_analytics (conv_id);

CREATE INDEX IF NOT EXISTS idx_cm_derivation_run_conv_created
  ON cm_conversation_derivation_run (conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_derivation_conv_kind
  ON cm_conversation_derivation (conv_id, derivation_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_derivation_run
  ON cm_conversation_derivation (derivation_run_id);
CREATE INDEX IF NOT EXISTS idx_cm_derivation_msg
  ON cm_conversation_derivation (msg_id) WHERE msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_derivation_checkpoint
  ON cm_conversation_derivation (checkpoint_id) WHERE checkpoint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_promotion_candidate_run
  ON cm_conversation_promotion_candidate (derivation_run_id);
CREATE INDEX IF NOT EXISTS idx_cm_promotion_candidate_conv
  ON cm_conversation_promotion_candidate (conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_promotion_candidate_derivation
  ON cm_conversation_promotion_candidate (derivation_id);
CREATE INDEX IF NOT EXISTS idx_cm_message_analytics_derivation_run
  ON cm_message_analytics (derivation_run_id) WHERE derivation_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_analytics_derivation_run
  ON cm_conversation_analytics (derivation_run_id) WHERE derivation_run_id IS NOT NULL;

CREATE OR REPLACE FUNCTION cm_reject_conversation_derivation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable derivation evidence; insert a superseding derivation run instead', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_conversation_derivation_run_immutable ON cm_conversation_derivation_run;
CREATE TRIGGER trg_cm_conversation_derivation_run_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_derivation_run
FOR EACH ROW EXECUTE FUNCTION cm_reject_conversation_derivation_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_derivation_immutable ON cm_conversation_derivation;
CREATE TRIGGER trg_cm_conversation_derivation_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_derivation
FOR EACH ROW EXECUTE FUNCTION cm_reject_conversation_derivation_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_promotion_candidate_immutable ON cm_conversation_promotion_candidate;
CREATE TRIGGER trg_cm_conversation_promotion_candidate_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_promotion_candidate
FOR EACH ROW EXECUTE FUNCTION cm_reject_conversation_derivation_mutation();

ALTER TABLE cm_conversation_derivation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_conversation_derivation_run FORCE ROW LEVEL SECURITY;
ALTER TABLE cm_conversation_derivation ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_conversation_derivation FORCE ROW LEVEL SECURITY;
ALTER TABLE cm_conversation_promotion_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_conversation_promotion_candidate FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_conversation_derivation_run;
CREATE POLICY cm_conversation_deriver_select ON cm_conversation_derivation_run
FOR SELECT TO comind_conversation_deriver USING (true);
DROP POLICY IF EXISTS cm_conversation_deriver_insert ON cm_conversation_derivation_run;
CREATE POLICY cm_conversation_deriver_insert ON cm_conversation_derivation_run
FOR INSERT TO comind_conversation_deriver WITH CHECK (true);

DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_conversation_derivation;
CREATE POLICY cm_conversation_deriver_select ON cm_conversation_derivation
FOR SELECT TO comind_conversation_deriver USING (true);
DROP POLICY IF EXISTS cm_conversation_deriver_insert ON cm_conversation_derivation;
CREATE POLICY cm_conversation_deriver_insert ON cm_conversation_derivation
FOR INSERT TO comind_conversation_deriver WITH CHECK (true);

DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_conversation_promotion_candidate;
CREATE POLICY cm_conversation_deriver_select ON cm_conversation_promotion_candidate
FOR SELECT TO comind_conversation_deriver USING (true);
DROP POLICY IF EXISTS cm_conversation_deriver_insert ON cm_conversation_promotion_candidate;
CREATE POLICY cm_conversation_deriver_insert ON cm_conversation_promotion_candidate
FOR INSERT TO comind_conversation_deriver WITH CHECK (true);

-- Source tables already protected by RLS receive a role-specific read policy.
DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_conversation;
CREATE POLICY cm_conversation_deriver_select ON cm_conversation
FOR SELECT TO comind_conversation_deriver USING (true);
DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_message;
CREATE POLICY cm_conversation_deriver_select ON cm_message
FOR SELECT TO comind_conversation_deriver USING (true);

REVOKE ALL ON cm_conversation_derivation_run FROM PUBLIC;
REVOKE ALL ON cm_conversation_derivation FROM PUBLIC;
REVOKE ALL ON cm_conversation_promotion_candidate FROM PUBLIC;
REVOKE ALL ON cm_message_analytics FROM PUBLIC;
REVOKE ALL ON cm_conversation_analytics FROM PUBLIC;
REVOKE ALL ON FUNCTION cm_reject_conversation_derivation_mutation() FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON comind.cm_conversation_derivation_run FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_conversation_derivation FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_conversation_promotion_candidate FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_message_analytics FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_conversation_analytics FROM %I', role_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION comind.cm_reject_conversation_derivation_mutation() FROM %I', role_name);
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA comind TO comind_conversation_deriver;
GRANT SELECT ON cm_conversation, cm_message, cm_assistant_generation,
  cm_conversation_capture_event, cm_conversation_recovery_checkpoint
  TO comind_conversation_deriver;
GRANT SELECT, INSERT ON cm_conversation_derivation_run, cm_conversation_derivation,
  cm_conversation_promotion_candidate TO comind_conversation_deriver;
GRANT SELECT, INSERT, UPDATE ON cm_message_analytics, cm_conversation_analytics
  TO comind_conversation_deriver;

COMMENT ON TABLE cm_conversation_derivation_run IS
  'CFR-001G immutable derivation-run evidence over an exact conversation source snapshot.';
COMMENT ON TABLE cm_conversation_derivation IS
  'CFR-001G immutable typed analytical observations with source provenance and uncertainty.';
COMMENT ON TABLE cm_conversation_promotion_candidate IS
  'CFR-001G reviewable promotion suggestions only; rows never perform canonical promotion.';

COMMIT;
