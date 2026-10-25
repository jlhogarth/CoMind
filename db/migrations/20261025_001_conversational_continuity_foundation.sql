-- CFR-001: Conversational Continuity Foundation v0.1
-- Issue #176
--
-- Governing rule:
-- Capture first, interpret second, promote deliberately, prune last.
--
-- This migration extends the existing CoMind conversation substrate. It does not
-- replace cm_conversation, cm_message, archive ingestion, or derived analytics.
-- Raw capture evidence is append-only. Assistant generation state is a controlled
-- mutable projection over that immutable event history.

CREATE SCHEMA IF NOT EXISTS comind;

-- ---------------------------------------------------------------------------
-- Assistant generation lifecycle
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comind.cm_assistant_generation (
  generation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  user_msg_id uuid NOT NULL REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
  claim_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  provider text,
  model text,
  status text NOT NULL DEFAULT 'active',
  assistant_msg_id uuid REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
  failure_code text,
  interruption_reason text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  interrupted_at timestamptz,
  failed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object')
);

ALTER TABLE comind.cm_assistant_generation
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS interruption_reason text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS interrupted_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE comind.cm_assistant_generation
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_status_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_failure_code_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_terminal_state_check,
  DROP CONSTRAINT IF EXISTS cm_assistant_generation_metadata_check;

ALTER TABLE comind.cm_assistant_generation
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

CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_conv
  ON comind.cm_assistant_generation (conv_id, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_status
  ON comind.cm_assistant_generation (status, last_activity_at DESC);

-- ---------------------------------------------------------------------------
-- Immutable live capture event stream
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comind.cm_conversation_capture_cursor (
  conv_id uuid PRIMARY KEY REFERENCES comind.cm_conversation(conv_id) ON DELETE CASCADE,
  last_sequence_no bigint NOT NULL DEFAULT 0 CHECK (last_sequence_no >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_conversation_capture_event (
  capture_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES comind.cm_assistant_generation(generation_id) ON DELETE RESTRICT,
  msg_id uuid REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
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
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(raw_payload) = 'object'),
  event_sha256 char(64) NOT NULL CHECK (event_sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_capture_event_sequence_unique UNIQUE (conv_id, sequence_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_conversation_capture_source_event
  ON comind.cm_conversation_capture_event (conv_id, source_system, source_event_ref)
  WHERE source_event_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_generation
  ON comind.cm_conversation_capture_event (generation_id, sequence_no)
  WHERE generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_time
  ON comind.cm_conversation_capture_event (captured_at DESC, conv_id);

-- ---------------------------------------------------------------------------
-- Recovery checkpoints and promotion evaluation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comind.cm_conversation_recovery_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES comind.cm_assistant_generation(generation_id) ON DELETE RESTRICT,
  checkpoint_reason text NOT NULL,
  last_capture_sequence bigint NOT NULL CHECK (last_capture_sequence >= 0),
  last_complete_msg_id uuid REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
  partial_assistant_content text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 char(64) NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_checkpoint
  ON comind.cm_conversation_recovery_checkpoint (conv_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comind.cm_conversation_promotion_evaluation (
  evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  checkpoint_id uuid REFERENCES comind.cm_conversation_recovery_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('retain_raw', 'eligible_to_prune', 'extend_protection')),
  evaluated_by text NOT NULL,
  rationale text NOT NULL,
  protected_until timestamptz,
  promotions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(promotions) = 'array'),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence) = 'array'),
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_promotion_eval
  ON comind.cm_conversation_promotion_evaluation (conv_id, evaluated_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only and lifecycle guards
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comind.cm_reject_cfr_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; insert a corrective or superseding record instead', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_assistant_generation_transition()
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

  IF NEW.status NOT IN ('active', 'completed', 'interrupted', 'failed') THEN
    RAISE EXCEPTION 'invalid assistant generation transition to %', NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_conversation_capture_event_immutable
  ON comind.cm_conversation_capture_event;
CREATE TRIGGER trg_cm_conversation_capture_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_capture_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_recovery_checkpoint_immutable
  ON comind.cm_conversation_recovery_checkpoint;
CREATE TRIGGER trg_cm_conversation_recovery_checkpoint_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_recovery_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_promotion_eval_immutable
  ON comind.cm_conversation_promotion_evaluation;
CREATE TRIGGER trg_cm_conversation_promotion_eval_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_promotion_evaluation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_assistant_generation_transition
  ON comind.cm_assistant_generation;
CREATE TRIGGER trg_cm_assistant_generation_transition
BEFORE UPDATE OR DELETE ON comind.cm_assistant_generation
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_assistant_generation_transition();

-- ---------------------------------------------------------------------------
-- Capture functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comind.cm_record_conversation_capture_event(
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
SET search_path = pg_catalog, comind, extensions
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
    FROM comind.cm_conversation_capture_event
    WHERE conv_id = p_conv_id
      AND source_system = p_source_system
      AND source_event_ref = p_source_event_ref;

    IF v_existing_event_id IS NOT NULL THEN
      RETURN v_existing_event_id;
    END IF;
  END IF;

  INSERT INTO comind.cm_conversation_capture_cursor (conv_id, last_sequence_no, updated_at)
  VALUES (p_conv_id, 1, now())
  ON CONFLICT (conv_id) DO UPDATE
    SET last_sequence_no = comind.cm_conversation_capture_cursor.last_sequence_no + 1,
        updated_at = now()
  RETURNING last_sequence_no INTO v_sequence_no;

  v_hash := encode(
    extensions.digest(
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

  INSERT INTO comind.cm_conversation_capture_event (
    conv_id,
    generation_id,
    msg_id,
    sequence_no,
    event_type,
    role,
    content_delta,
    source_system,
    source_event_ref,
    source_observed_at,
    raw_payload,
    event_sha256
  ) VALUES (
    p_conv_id,
    p_generation_id,
    p_msg_id,
    v_sequence_no,
    p_event_type,
    p_role,
    p_content_delta,
    p_source_system,
    p_source_event_ref,
    p_source_observed_at,
    coalesce(p_raw_payload, '{}'::jsonb),
    v_hash
  )
  RETURNING capture_event_id INTO v_event_id;

  RETURN v_event_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_source_event_ref IS NOT NULL THEN
      SELECT capture_event_id
        INTO v_existing_event_id
      FROM comind.cm_conversation_capture_event
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

CREATE OR REPLACE FUNCTION comind.cm_capture_user_message(
  p_conv_id uuid,
  p_content text,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_msg_id uuid;
BEGIN
  IF p_source_event_ref IS NOT NULL THEN
    SELECT msg_id
      INTO v_msg_id
    FROM comind.cm_conversation_capture_event
    WHERE conv_id = p_conv_id
      AND source_system = p_source_system
      AND source_event_ref = p_source_event_ref
      AND event_type = 'user_message_observed';

    IF v_msg_id IS NOT NULL THEN
      RETURN v_msg_id;
    END IF;
  END IF;

  INSERT INTO comind.cm_message (conv_id, role, content, meta)
  VALUES (p_conv_id, 'user', p_content, coalesce(p_meta, '{}'::jsonb))
  RETURNING msg_id INTO v_msg_id;

  PERFORM comind.cm_record_conversation_capture_event(
    p_conv_id => p_conv_id,
    p_event_type => 'user_message_observed',
    p_role => 'user',
    p_content_delta => p_content,
    p_msg_id => v_msg_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => p_raw_payload
  );

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_start_assistant_generation(
  p_conv_id uuid,
  p_user_msg_id uuid,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_generation_id uuid;
  v_role text;
  v_msg_conv_id uuid;
BEGIN
  IF p_source_event_ref IS NOT NULL THEN
    SELECT generation_id
      INTO v_generation_id
    FROM comind.cm_conversation_capture_event
    WHERE conv_id = p_conv_id
      AND source_system = p_source_system
      AND source_event_ref = p_source_event_ref
      AND event_type = 'assistant_generation_started';

    IF v_generation_id IS NOT NULL THEN
      RETURN v_generation_id;
    END IF;
  END IF;

  SELECT conv_id, role INTO v_msg_conv_id, v_role
  FROM comind.cm_message
  WHERE msg_id = p_user_msg_id;

  IF v_msg_conv_id IS NULL OR v_msg_conv_id <> p_conv_id OR v_role <> 'user' THEN
    RAISE EXCEPTION 'generation must reference a user message in the same conversation';
  END IF;

  INSERT INTO comind.cm_assistant_generation (
    conv_id,
    user_msg_id,
    provider,
    model,
    metadata
  ) VALUES (
    p_conv_id,
    p_user_msg_id,
    p_provider,
    p_model,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING generation_id INTO v_generation_id;

  PERFORM comind.cm_record_conversation_capture_event(
    p_conv_id => p_conv_id,
    p_event_type => 'assistant_generation_started',
    p_role => 'assistant',
    p_generation_id => v_generation_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => jsonb_build_object(
      'provider', p_provider,
      'model', p_model,
      'metadata', coalesce(p_metadata, '{}'::jsonb)
    )
  );

  RETURN v_generation_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_append_assistant_delta(
  p_generation_id uuid,
  p_delta text,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_conv_id uuid;
  v_status text;
  v_event_id uuid;
BEGIN
  SELECT conv_id, status INTO v_conv_id, v_status
  FROM comind.cm_assistant_generation
  WHERE generation_id = p_generation_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'unknown assistant generation %', p_generation_id;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'assistant generation % is %, not active', p_generation_id, v_status;
  END IF;

  v_event_id := comind.cm_record_conversation_capture_event(
    p_conv_id => v_conv_id,
    p_event_type => 'assistant_delta',
    p_role => 'assistant',
    p_content_delta => p_delta,
    p_generation_id => p_generation_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => p_raw_payload
  );

  UPDATE comind.cm_assistant_generation
  SET last_activity_at = now()
  WHERE generation_id = p_generation_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_complete_assistant_generation(
  p_generation_id uuid,
  p_content text,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_conv_id uuid;
  v_status text;
  v_existing_msg_id uuid;
  v_msg_id uuid;
BEGIN
  SELECT conv_id, status, assistant_msg_id
    INTO v_conv_id, v_status, v_existing_msg_id
  FROM comind.cm_assistant_generation
  WHERE generation_id = p_generation_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'unknown assistant generation %', p_generation_id;
  END IF;

  IF v_status = 'completed' THEN
    RETURN v_existing_msg_id;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'assistant generation % cannot complete from status %', p_generation_id, v_status;
  END IF;

  INSERT INTO comind.cm_message (conv_id, role, content, meta)
  VALUES (v_conv_id, 'assistant', p_content, coalesce(p_meta, '{}'::jsonb))
  RETURNING msg_id INTO v_msg_id;

  UPDATE comind.cm_assistant_generation
  SET status = 'completed',
      assistant_msg_id = v_msg_id,
      completed_at = now(),
      last_activity_at = now()
  WHERE generation_id = p_generation_id;

  PERFORM comind.cm_record_conversation_capture_event(
    p_conv_id => v_conv_id,
    p_event_type => 'assistant_generation_completed',
    p_role => 'assistant',
    p_content_delta => p_content,
    p_generation_id => p_generation_id,
    p_msg_id => v_msg_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => p_raw_payload
  );

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_interrupt_assistant_generation(
  p_generation_id uuid,
  p_reason text,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_conv_id uuid;
  v_status text;
  v_event_id uuid;
BEGIN
  SELECT conv_id, status INTO v_conv_id, v_status
  FROM comind.cm_assistant_generation
  WHERE generation_id = p_generation_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'unknown assistant generation %', p_generation_id;
  END IF;

  IF v_status = 'interrupted' THEN
    SELECT capture_event_id INTO v_event_id
    FROM comind.cm_conversation_capture_event
    WHERE generation_id = p_generation_id
      AND event_type = 'assistant_generation_interrupted'
    ORDER BY sequence_no DESC
    LIMIT 1;
    RETURN v_event_id;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'assistant generation % cannot interrupt from status %', p_generation_id, v_status;
  END IF;

  UPDATE comind.cm_assistant_generation
  SET status = 'interrupted',
      interruption_reason = p_reason,
      interrupted_at = now(),
      last_activity_at = now()
  WHERE generation_id = p_generation_id;

  v_event_id := comind.cm_record_conversation_capture_event(
    p_conv_id => v_conv_id,
    p_event_type => 'assistant_generation_interrupted',
    p_role => 'assistant',
    p_generation_id => p_generation_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => coalesce(p_raw_payload, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
  );

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_fail_assistant_generation(
  p_generation_id uuid,
  p_failure_code text,
  p_source_system text DEFAULT 'comind',
  p_source_event_ref text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_conv_id uuid;
  v_status text;
  v_event_id uuid;
BEGIN
  SELECT conv_id, status INTO v_conv_id, v_status
  FROM comind.cm_assistant_generation
  WHERE generation_id = p_generation_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'unknown assistant generation %', p_generation_id;
  END IF;

  IF v_status = 'failed' THEN
    SELECT capture_event_id INTO v_event_id
    FROM comind.cm_conversation_capture_event
    WHERE generation_id = p_generation_id
      AND event_type = 'assistant_generation_failed'
    ORDER BY sequence_no DESC
    LIMIT 1;
    RETURN v_event_id;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'assistant generation % cannot fail from status %', p_generation_id, v_status;
  END IF;

  UPDATE comind.cm_assistant_generation
  SET status = 'failed',
      failure_code = p_failure_code,
      failed_at = now(),
      last_activity_at = now()
  WHERE generation_id = p_generation_id;

  v_event_id := comind.cm_record_conversation_capture_event(
    p_conv_id => v_conv_id,
    p_event_type => 'assistant_generation_failed',
    p_role => 'assistant',
    p_generation_id => p_generation_id,
    p_source_system => p_source_system,
    p_source_event_ref => p_source_event_ref,
    p_raw_payload => coalesce(p_raw_payload, '{}'::jsonb) || jsonb_build_object('failure_code', p_failure_code)
  );

  RETURN v_event_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Recovery and pruning gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comind.cm_create_recovery_checkpoint(
  p_conv_id uuid,
  p_generation_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'automatic'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind, extensions
AS $$
DECLARE
  v_checkpoint_id uuid;
  v_last_sequence bigint;
  v_last_complete_msg_id uuid;
  v_partial text;
  v_generation_status text;
  v_snapshot jsonb;
  v_hash char(64);
BEGIN
  SELECT coalesce(max(sequence_no), 0)
    INTO v_last_sequence
  FROM comind.cm_conversation_capture_event
  WHERE conv_id = p_conv_id;

  SELECT msg_id
    INTO v_last_complete_msg_id
  FROM comind.cm_message
  WHERE conv_id = p_conv_id
  ORDER BY created_at DESC, msg_id DESC
  LIMIT 1;

  IF p_generation_id IS NOT NULL THEN
    SELECT status INTO v_generation_status
    FROM comind.cm_assistant_generation
    WHERE generation_id = p_generation_id
      AND conv_id = p_conv_id;

    IF v_generation_status IS NULL THEN
      RAISE EXCEPTION 'generation % does not belong to conversation %', p_generation_id, p_conv_id;
    END IF;

    SELECT string_agg(coalesce(content_delta, ''), '' ORDER BY sequence_no)
      INTO v_partial
    FROM comind.cm_conversation_capture_event
    WHERE generation_id = p_generation_id
      AND event_type = 'assistant_delta';
  END IF;

  v_snapshot := jsonb_build_object(
    'conversation_id', p_conv_id,
    'generation_id', p_generation_id,
    'generation_status', v_generation_status,
    'last_capture_sequence', v_last_sequence,
    'last_complete_message_id', v_last_complete_msg_id,
    'partial_assistant_content', v_partial,
    'checkpoint_reason', p_reason
  );

  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');

  INSERT INTO comind.cm_conversation_recovery_checkpoint (
    conv_id,
    generation_id,
    checkpoint_reason,
    last_capture_sequence,
    last_complete_msg_id,
    partial_assistant_content,
    snapshot,
    snapshot_sha256
  ) VALUES (
    p_conv_id,
    p_generation_id,
    p_reason,
    v_last_sequence,
    v_last_complete_msg_id,
    v_partial,
    v_snapshot,
    v_hash
  )
  RETURNING checkpoint_id INTO v_checkpoint_id;

  RETURN v_checkpoint_id;
END;
$$;

CREATE OR REPLACE VIEW comind.v_conversation_recovery_state
WITH (security_invoker = true)
AS
SELECT
  g.conv_id,
  g.generation_id,
  g.user_msg_id,
  g.assistant_msg_id,
  g.status AS generation_status,
  g.provider,
  g.model,
  g.claimed_at,
  g.last_activity_at,
  g.completed_at,
  g.interrupted_at,
  g.failed_at,
  g.interruption_reason,
  g.failure_code,
  coalesce(e.last_capture_sequence, 0) AS last_capture_sequence,
  e.partial_assistant_content,
  m.msg_id AS last_complete_msg_id,
  m.role AS last_complete_role,
  m.created_at AS last_complete_message_at
FROM comind.cm_assistant_generation g
LEFT JOIN LATERAL (
  SELECT
    max(sequence_no) AS last_capture_sequence,
    string_agg(coalesce(content_delta, ''), '' ORDER BY sequence_no)
      FILTER (WHERE event_type = 'assistant_delta') AS partial_assistant_content
  FROM comind.cm_conversation_capture_event ce
  WHERE ce.generation_id = g.generation_id
) e ON true
LEFT JOIN LATERAL (
  SELECT msg_id, role, created_at
  FROM comind.cm_message cm
  WHERE cm.conv_id = g.conv_id
  ORDER BY created_at DESC, msg_id DESC
  LIMIT 1
) m ON true;

CREATE OR REPLACE FUNCTION comind.cm_assert_conversation_prunable(p_conv_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_min_hours integer := 36;
  v_latest_capture timestamptz;
  v_eval_decision text;
  v_protected_until timestamptz;
  v_active_generations bigint;
BEGIN
  SELECT coalesce((rules ->> 'minimum_protected_hours')::integer, 36)
    INTO v_min_hours
  FROM comind.cm_retention_policy
  WHERE name = 'conversation_raw_protected_36h'::citext
  LIMIT 1;

  v_min_hours := coalesce(v_min_hours, 36);

  SELECT max(captured_at) INTO v_latest_capture
  FROM comind.cm_conversation_capture_event
  WHERE conv_id = p_conv_id;

  IF v_latest_capture IS NULL THEN
    RAISE EXCEPTION 'conversation % has no captured evidence', p_conv_id;
  END IF;

  IF now() < v_latest_capture + make_interval(hours => v_min_hours) THEN
    RAISE EXCEPTION 'conversation % remains inside the protected raw-retention window', p_conv_id;
  END IF;

  SELECT count(*) INTO v_active_generations
  FROM comind.cm_assistant_generation
  WHERE conv_id = p_conv_id
    AND status = 'active';

  IF v_active_generations > 0 THEN
    RAISE EXCEPTION 'conversation % has active assistant generations', p_conv_id;
  END IF;

  SELECT decision, protected_until
    INTO v_eval_decision, v_protected_until
  FROM comind.cm_conversation_promotion_evaluation
  WHERE conv_id = p_conv_id
  ORDER BY evaluated_at DESC, evaluation_id DESC
  LIMIT 1;

  IF v_eval_decision IS DISTINCT FROM 'eligible_to_prune' THEN
    RAISE EXCEPTION 'conversation % lacks an eligible_to_prune promotion evaluation', p_conv_id;
  END IF;

  IF v_protected_until IS NOT NULL AND now() < v_protected_until THEN
    RAISE EXCEPTION 'conversation % has extended protection until %', p_conv_id, v_protected_until;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Default protected-retention contract
-- ---------------------------------------------------------------------------

INSERT INTO comind.cm_retention_policy (name, description, rules)
SELECT
  'conversation_raw_protected_36h'::citext,
  'CFR-001 minimum protected window for immutable raw conversation capture evidence. Destructive pruning requires both expiry and an explicit promotion evaluation.',
  jsonb_build_object(
    'minimum_protected_hours', 36,
    'requires_promotion_evaluation', true,
    'required_prune_decision', 'eligible_to_prune',
    'capture_first', true,
    'summary_is_not_source_evidence', true
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM comind.cm_retention_policy
  WHERE name = 'conversation_raw_protected_36h'::citext
);

INSERT INTO comind.cm_retention_binding (rp_id, target_table, target_id)
SELECT rp.rp_id, v.target_table, NULL::uuid
FROM comind.cm_retention_policy rp
CROSS JOIN (VALUES
  ('comind.cm_conversation_capture_event'::text),
  ('comind.cm_conversation_recovery_checkpoint'::text)
) AS v(target_table)
WHERE rp.name = 'conversation_raw_protected_36h'::citext
  AND NOT EXISTS (
    SELECT 1
    FROM comind.cm_retention_binding rb
    WHERE rb.rp_id = rp.rp_id
      AND rb.target_table = v.target_table
      AND rb.target_id IS NULL
  );

COMMENT ON TABLE comind.cm_assistant_generation IS
  'Controlled lifecycle projection for one assistant response attempt. Raw evidence lives in cm_conversation_capture_event.';
COMMENT ON TABLE comind.cm_conversation_capture_event IS
  'Immutable sequence-ordered live conversation event evidence. Deltas survive incomplete assistant turns.';
COMMENT ON TABLE comind.cm_conversation_recovery_checkpoint IS
  'Immutable recovery manifest snapshot identifying last complete message and recoverable partial assistant content.';
COMMENT ON TABLE comind.cm_conversation_promotion_evaluation IS
  'Immutable decision record proving promotion and retention evaluation occurred before raw pruning eligibility.';
COMMENT ON FUNCTION comind.cm_assert_conversation_prunable(uuid) IS
  'CFR-001 destructive-pruning gate. It does not prune. It only proves that minimum retention and promotion prerequisites are satisfied.';
