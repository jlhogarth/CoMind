-- CoMind One-Shot v2 - 14_conversational_continuity.sql
-- CFR-001 / CFR-001C
--
-- Local/CI schema parity for the conversational continuity substrate already
-- deployed to the Supabase Test environment. This file deliberately avoids
-- Supabase-specific anon/authenticated/service_role grants.

BEGIN;
SET search_path TO comind, public;

ALTER TABLE cm_assistant_generation
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS interruption_reason text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS interrupted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cm_assistant_generation
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_status_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_failure_code_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_terminal_state_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_metadata_check;

ALTER TABLE cm_assistant_generation
  ADD CONSTRAINT cm_assistant_generation_status_check
    CHECK (status IN ('active', 'completed', 'interrupted', 'failed')),
  ADD CONSTRAINT cm_assistant_generation_failure_code_check
    CHECK (failure_code IS NULL OR length(btrim(failure_code)) > 0),
  ADD CONSTRAINT cm_assistant_generation_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  ADD CONSTRAINT cm_assistant_generation_terminal_state_check CHECK (
    (status = 'active'
      AND assistant_msg_id IS NULL
      AND completed_at IS NULL
      AND interrupted_at IS NULL
      AND failed_at IS NULL
      AND failure_code IS NULL)
    OR
    (status = 'completed'
      AND assistant_msg_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND interrupted_at IS NULL
      AND failed_at IS NULL
      AND failure_code IS NULL)
    OR
    (status = 'interrupted'
      AND assistant_msg_id IS NULL
      AND completed_at IS NULL
      AND interrupted_at IS NOT NULL
      AND failed_at IS NULL
      AND failure_code IS NULL)
    OR
    (status = 'failed'
      AND assistant_msg_id IS NULL
      AND completed_at IS NULL
      AND interrupted_at IS NULL
      AND failed_at IS NOT NULL
      AND failure_code IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS cm_conversation_capture_cursor (
  conv_id uuid PRIMARY KEY REFERENCES cm_conversation(conv_id) ON DELETE CASCADE,
  last_sequence_no bigint NOT NULL DEFAULT 0 CHECK (last_sequence_no >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_conversation_capture_event (
  capture_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES cm_assistant_generation(generation_id) ON DELETE RESTRICT,
  msg_id uuid REFERENCES cm_message(msg_id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  event_type text NOT NULL CHECK (event_type IN (
    'user_message_observed',
    'system_message_observed',
    'tool_message_observed',
    'assistant_message_observed',
    'assistant_generation_started',
    'assistant_delta',
    'assistant_generation_completed',
    'assistant_generation_interrupted',
    'assistant_generation_failed',
    'tool_call_started',
    'tool_call_completed',
    'capture_warning',
    'source_reconciliation'
  )),
  role text CHECK (role IS NULL OR role IN ('user', 'assistant', 'system', 'tool')),
  content_delta text,
  source_system text NOT NULL DEFAULT 'comind',
  source_event_ref text,
  source_observed_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_payload) = 'object'),
  event_sha256 char(64) NOT NULL CHECK (event_sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_capture_event_sequence_unique UNIQUE (conv_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS cm_conversation_recovery_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES cm_assistant_generation(generation_id) ON DELETE RESTRICT,
  checkpoint_reason text NOT NULL,
  last_capture_sequence bigint NOT NULL CHECK (last_capture_sequence >= 0),
  last_complete_msg_id uuid REFERENCES cm_message(msg_id) ON DELETE RESTRICT,
  partial_assistant_content text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_conversation_promotion_evaluation (
  evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE RESTRICT,
  checkpoint_id uuid REFERENCES cm_conversation_recovery_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('retain_raw', 'eligible_to_prune', 'extend_protection')),
  evaluated_by text NOT NULL,
  rationale text NOT NULL,
  protected_until timestamptz,
  promotions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(promotions) = 'array'),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_conversation_capture_source_event
  ON cm_conversation_capture_event (conv_id, source_system, source_event_ref)
  WHERE source_event_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_generation
  ON cm_conversation_capture_event (generation_id, sequence_no)
  WHERE generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_time
  ON cm_conversation_capture_event (captured_at DESC, conv_id);
CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_msg
  ON cm_conversation_capture_event (msg_id)
  WHERE msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_checkpoint
  ON cm_conversation_recovery_checkpoint (conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_generation
  ON cm_conversation_recovery_checkpoint (generation_id)
  WHERE generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_last_message
  ON cm_conversation_recovery_checkpoint (last_complete_msg_id)
  WHERE last_complete_msg_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_conversation_promotion_eval
  ON cm_conversation_promotion_evaluation (conv_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_conversation_promotion_checkpoint
  ON cm_conversation_promotion_evaluation (checkpoint_id)
  WHERE checkpoint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_user_msg
  ON cm_assistant_generation (user_msg_id);
CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_assistant_msg
  ON cm_assistant_generation (assistant_msg_id)
  WHERE assistant_msg_id IS NOT NULL;

CREATE OR REPLACE FUNCTION cm_reject_cfr_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a corrective or superseding record instead', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION cm_guard_assistant_generation_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assistant generation history cannot be deleted';
  END IF;

  IF NEW.conv_id <> OLD.conv_id
     OR NEW.user_msg_id <> OLD.user_msg_id
     OR NEW.claim_token <> OLD.claim_token
     OR NEW.claimed_at <> OLD.claimed_at THEN
    RAISE EXCEPTION 'assistant generation identity fields are immutable';
  END IF;

  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'terminal assistant generation % cannot be modified', OLD.generation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_conversation_capture_event_immutable ON cm_conversation_capture_event;
CREATE TRIGGER trg_cm_conversation_capture_event_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_capture_event
FOR EACH ROW EXECUTE FUNCTION cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_recovery_checkpoint_immutable ON cm_conversation_recovery_checkpoint;
CREATE TRIGGER trg_cm_conversation_recovery_checkpoint_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_recovery_checkpoint
FOR EACH ROW EXECUTE FUNCTION cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_promotion_eval_immutable ON cm_conversation_promotion_evaluation;
CREATE TRIGGER trg_cm_conversation_promotion_eval_immutable
BEFORE UPDATE OR DELETE ON cm_conversation_promotion_evaluation
FOR EACH ROW EXECUTE FUNCTION cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_assistant_generation_transition ON cm_assistant_generation;
CREATE TRIGGER trg_cm_assistant_generation_transition
BEFORE UPDATE OR DELETE ON cm_assistant_generation
FOR EACH ROW EXECUTE FUNCTION cm_guard_assistant_generation_transition();

CREATE OR REPLACE FUNCTION cm_record_conversation_capture_event(
  p_conv_id uuid,
  p_event_type text,
  p_role text DEFAULT NULL,
  p_content_delta text DEFAULT NULL,
  p_generation_id uuid DEFAULT NULL,
  p_msg_id uuid DEFAULT NULL,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_source_observed_at timestamptz DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind, public
AS $$
DECLARE
  v_event_id uuid;
  v_existing_event_id uuid;
  v_sequence_no bigint;
  v_hash char(64);
BEGIN
  IF p_source_event_ref IS NOT NULL THEN
    SELECT capture_event_id
      INTO v_existing_event_id
    FROM cm_conversation_capture_event
    WHERE conv_id = p_conv_id
      AND source_system = p_source_system
      AND source_event_ref = p_source_event_ref;

    IF v_existing_event_id IS NOT NULL THEN
      RETURN v_existing_event_id;
    END IF;
  END IF;

  INSERT INTO cm_conversation_capture_cursor (conv_id, last_sequence_no, updated_at)
  VALUES (p_conv_id, 1, now())
  ON CONFLICT (conv_id) DO UPDATE
    SET last_sequence_no = cm_conversation_capture_cursor.last_sequence_no + 1,
        updated_at = now()
  RETURNING last_sequence_no INTO v_sequence_no;

  v_hash := encode(
    digest(
      concat_ws('|',
        p_conv_id::text,
        v_sequence_no::text,
        p_event_type,
        coalesce(p_role, ''),
        coalesce(p_content_delta, ''),
        coalesce(p_generation_id::text, ''),
        coalesce(p_msg_id::text, ''),
        p_source_system,
        coalesce(p_source_event_ref, ''),
        coalesce(p_raw_payload, '{}'::jsonb)::text
      ),
      'sha256'
    ),
    'hex'
  );

  INSERT INTO cm_conversation_capture_event (
    conv_id, generation_id, msg_id, sequence_no, event_type, role,
    content_delta, source_system, source_event_ref, source_observed_at,
    raw_payload, event_sha256
  ) VALUES (
    p_conv_id, p_generation_id, p_msg_id, v_sequence_no, p_event_type, p_role,
    p_content_delta, p_source_system, p_source_event_ref, p_source_observed_at,
    coalesce(p_raw_payload, '{}'::jsonb), v_hash
  )
  RETURNING capture_event_id INTO v_event_id;

  RETURN v_event_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_source_event_ref IS NOT NULL THEN
      SELECT capture_event_id
        INTO v_existing_event_id
      FROM cm_conversation_capture_event
      WHERE conv_id = p_conv_id
        AND source_system = p_source_system
        AND source_event_ref = p_source_event_ref;
      IF v_existing_event_id IS NOT NULL THEN
        RETURN v_existing_event_id;
      END IF;
    END IF;
    RAISE;
END;
$$;

INSERT INTO cm_retention_policy (name, description, rules)
SELECT
  'conversation_raw_protected_36h'::citext,
  'CFR-001 minimum protected window for immutable raw conversation capture evidence.',
  jsonb_build_object(
    'minimum_protected_hours', 36,
    'requires_promotion_evaluation', true,
    'required_prune_decision', 'eligible_to_prune',
    'capture_first', true,
    'summary_is_not_source_evidence', true
  )
WHERE NOT EXISTS (
  SELECT 1 FROM cm_retention_policy WHERE name = 'conversation_raw_protected_36h'::citext
);

INSERT INTO cm_retention_binding (rp_id, target_table, target_id)
SELECT rp.rp_id, v.target_table, NULL::uuid
FROM cm_retention_policy rp
CROSS JOIN (VALUES
  ('comind.cm_conversation_capture_event'::text),
  ('comind.cm_conversation_recovery_checkpoint'::text)
) AS v(target_table)
WHERE rp.name = 'conversation_raw_protected_36h'::citext
  AND NOT EXISTS (
    SELECT 1
    FROM cm_retention_binding rb
    WHERE rb.rp_id = rp.rp_id
      AND rb.target_table = v.target_table
      AND rb.target_id IS NULL
  );

COMMIT;
