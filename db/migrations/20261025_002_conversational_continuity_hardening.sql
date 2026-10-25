-- CFR-001: Conversational Continuity Foundation v0.1.1 hardening
-- Issue #176
-- Adds covering indexes identified by the Supabase performance advisor and
-- makes the retention gate extension lookup explicit for reproducible deploys.

CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_user_msg
  ON comind.cm_assistant_generation (user_msg_id);

CREATE INDEX IF NOT EXISTS idx_cm_assistant_generation_assistant_msg
  ON comind.cm_assistant_generation (assistant_msg_id)
  WHERE assistant_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_capture_msg
  ON comind.cm_conversation_capture_event (msg_id)
  WHERE msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_generation
  ON comind.cm_conversation_recovery_checkpoint (generation_id)
  WHERE generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_recovery_last_message
  ON comind.cm_conversation_recovery_checkpoint (last_complete_msg_id)
  WHERE last_complete_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_promotion_checkpoint
  ON comind.cm_conversation_promotion_evaluation (checkpoint_id)
  WHERE checkpoint_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_assert_conversation_prunable(p_conv_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind, extensions
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
  WHERE name = 'conversation_raw_protected_36h'::extensions.citext
  LIMIT 1;

  v_min_hours := coalesce(v_min_hours, 36);

  SELECT max(captured_at)
    INTO v_latest_capture
  FROM comind.cm_conversation_capture_event
  WHERE conv_id = p_conv_id;

  IF v_latest_capture IS NULL THEN
    RAISE EXCEPTION 'conversation % has no captured evidence', p_conv_id;
  END IF;

  IF now() < v_latest_capture + make_interval(hours => v_min_hours) THEN
    RAISE EXCEPTION 'conversation % remains inside the protected raw-retention window', p_conv_id;
  END IF;

  SELECT count(*)
    INTO v_active_generations
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
