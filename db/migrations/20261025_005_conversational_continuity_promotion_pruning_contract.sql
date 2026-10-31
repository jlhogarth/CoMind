-- CFR-001E: Governed promotion and pruning contract v0.1
-- Issue #181
--
-- This migration does NOT delete conversation evidence. It defines the proof
-- contract that must exist before a future pruning executor could retire an
-- exact raw source range.
--
-- Governing rule:
-- Capture first. Interpret second. Promote deliberately. Prune last.

-- ---------------------------------------------------------------------------
-- Immutable prune manifest
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comind.cm_conversation_prune_manifest (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES comind.cm_retention_policy(rp_id) ON DELETE RESTRICT,
  evaluation_id uuid NOT NULL REFERENCES comind.cm_conversation_promotion_evaluation(evaluation_id) ON DELETE RESTRICT,
  checkpoint_id uuid NOT NULL REFERENCES comind.cm_conversation_recovery_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  first_sequence bigint NOT NULL CHECK (first_sequence > 0),
  last_sequence bigint NOT NULL CHECK (last_sequence >= first_sequence),
  event_count bigint NOT NULL CHECK (event_count > 0),
  source_digest char(64) NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  latest_capture_at timestamptz NOT NULL,
  eligible_at timestamptz NOT NULL,
  durable_destinations jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(durable_destinations) = 'array'),
  manifest_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(manifest_snapshot) = 'object'),
  manifest_sha256 char(64) NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_prune_manifest_contiguous_count_check
    CHECK (event_count = (last_sequence - first_sequence + 1)),
  CONSTRAINT cm_conversation_prune_manifest_range_unique
    UNIQUE (conv_id, first_sequence, last_sequence, evaluation_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_prune_manifest_conv
  ON comind.cm_conversation_prune_manifest (conv_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_prune_manifest_checkpoint
  ON comind.cm_conversation_prune_manifest (checkpoint_id);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_prune_manifest_policy
  ON comind.cm_conversation_prune_manifest (policy_id);

DROP TRIGGER IF EXISTS trg_cm_conversation_prune_manifest_immutable
  ON comind.cm_conversation_prune_manifest;
CREATE TRIGGER trg_cm_conversation_prune_manifest_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_prune_manifest
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_evidence_mutation();

-- ---------------------------------------------------------------------------
-- Deterministic eligibility evaluator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comind.cm_evaluate_conversation_prune_eligibility(
  p_conv_id uuid,
  p_as_of timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind, extensions
AS $$
DECLARE
  v_policy_id uuid;
  v_policy_rules jsonb;
  v_min_hours integer;
  v_first_sequence bigint;
  v_last_sequence bigint;
  v_event_count bigint;
  v_latest_capture_at timestamptz;
  v_source_digest char(64);
  v_eligible_at timestamptz;
  v_active_generations bigint := 0;
  v_checkpoint_id uuid;
  v_checkpoint_last_sequence bigint;
  v_checkpoint_sha256 char(64);
  v_checkpoint_created_at timestamptz;
  v_evaluation_id uuid;
  v_evaluation_checkpoint_id uuid;
  v_decision text;
  v_protected_until timestamptz;
  v_promotions jsonb := '[]'::jsonb;
  v_evaluation_evidence jsonb := '[]'::jsonb;
  v_evaluated_at timestamptz;
  v_uncovered_interrupted_generations bigint := 0;
  v_hold_reasons jsonb := '[]'::jsonb;
BEGIN
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'p_as_of is required';
  END IF;

  SELECT rp_id, rules
    INTO v_policy_id, v_policy_rules
  FROM comind.cm_retention_policy
  WHERE name = 'conversation_raw_protected_36h'::extensions.citext
  ORDER BY created_at, rp_id
  LIMIT 1;

  IF v_policy_id IS NULL THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('retention_policy_missing');
  ELSIF coalesce(v_policy_rules ->> 'minimum_protected_hours', '') ~ '^[0-9]+$' THEN
    v_min_hours := (v_policy_rules ->> 'minimum_protected_hours')::integer;
  ELSE
    v_hold_reasons := v_hold_reasons || jsonb_build_array('retention_policy_invalid');
  END IF;

  SELECT
    min(sequence_no),
    max(sequence_no),
    count(*),
    max(captured_at),
    encode(
      extensions.digest(
        string_agg(sequence_no::text || ':' || event_sha256::text, '|' ORDER BY sequence_no),
        'sha256'
      ),
      'hex'
    )
    INTO
      v_first_sequence,
      v_last_sequence,
      v_event_count,
      v_latest_capture_at,
      v_source_digest
  FROM comind.cm_conversation_capture_event
  WHERE conv_id = p_conv_id;

  IF coalesce(v_event_count, 0) = 0 THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('no_captured_evidence');
  ELSE
    IF v_event_count <> (v_last_sequence - v_first_sequence + 1) THEN
      v_hold_reasons := v_hold_reasons || jsonb_build_array('capture_sequence_gap');
    END IF;

    IF v_min_hours IS NOT NULL THEN
      v_eligible_at := v_latest_capture_at + make_interval(hours => v_min_hours);
      IF p_as_of < v_eligible_at THEN
        v_hold_reasons := v_hold_reasons || jsonb_build_array('protected_window_active');
      END IF;
    END IF;
  END IF;

  SELECT count(*)
    INTO v_active_generations
  FROM comind.cm_assistant_generation
  WHERE conv_id = p_conv_id
    AND status = 'active';

  IF v_active_generations > 0 THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('active_generation');
  END IF;

  SELECT
    checkpoint_id,
    last_capture_sequence,
    snapshot_sha256,
    created_at
    INTO
      v_checkpoint_id,
      v_checkpoint_last_sequence,
      v_checkpoint_sha256,
      v_checkpoint_created_at
  FROM comind.cm_conversation_recovery_checkpoint
  WHERE conv_id = p_conv_id
  ORDER BY last_capture_sequence DESC, created_at DESC, checkpoint_id DESC
  LIMIT 1;

  IF v_checkpoint_id IS NULL THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('recovery_checkpoint_missing');
  ELSIF v_last_sequence IS NOT NULL
        AND v_checkpoint_last_sequence < v_last_sequence THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('recovery_checkpoint_incomplete');
  END IF;

  SELECT
    evaluation_id,
    checkpoint_id,
    decision,
    protected_until,
    promotions,
    evidence,
    evaluated_at
    INTO
      v_evaluation_id,
      v_evaluation_checkpoint_id,
      v_decision,
      v_protected_until,
      v_promotions,
      v_evaluation_evidence,
      v_evaluated_at
  FROM comind.cm_conversation_promotion_evaluation
  WHERE conv_id = p_conv_id
  ORDER BY evaluated_at DESC, evaluation_id DESC
  LIMIT 1;

  IF v_evaluation_id IS NULL THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('promotion_evaluation_missing');
  ELSE
    IF v_checkpoint_id IS NULL
       OR v_evaluation_checkpoint_id IS NULL
       OR v_evaluation_checkpoint_id <> v_checkpoint_id THEN
      v_hold_reasons := v_hold_reasons || jsonb_build_array('promotion_checkpoint_mismatch');
    END IF;

    CASE v_decision
      WHEN 'retain_raw' THEN
        v_hold_reasons := v_hold_reasons || jsonb_build_array('promotion_decision_retain_raw');
      WHEN 'extend_protection' THEN
        IF v_protected_until IS NULL THEN
          v_hold_reasons := v_hold_reasons || jsonb_build_array('extended_protection_missing_deadline');
        ELSIF p_as_of < v_protected_until THEN
          v_hold_reasons := v_hold_reasons || jsonb_build_array('extended_protection_active');
        ELSE
          v_hold_reasons := v_hold_reasons || jsonb_build_array('promotion_decision_not_eligible');
        END IF;
      WHEN 'eligible_to_prune' THEN
        IF v_protected_until IS NOT NULL AND p_as_of < v_protected_until THEN
          v_hold_reasons := v_hold_reasons || jsonb_build_array('extended_protection_active');
        END IF;
      ELSE
        v_hold_reasons := v_hold_reasons || jsonb_build_array('promotion_decision_not_eligible');
    END CASE;
  END IF;

  -- Interrupted assistant deltas may be the only surviving copy of text that
  -- never became a canonical assistant message. Require a checkpoint that
  -- preserves each such generation exactly before raw deltas can be eligible.
  SELECT count(*)
    INTO v_uncovered_interrupted_generations
  FROM (
    SELECT
      g.generation_id,
      max(e.sequence_no) AS last_delta_sequence,
      string_agg(coalesce(e.content_delta, ''), '' ORDER BY e.sequence_no) AS partial_content
    FROM comind.cm_assistant_generation g
    JOIN comind.cm_conversation_capture_event e
      ON e.generation_id = g.generation_id
     AND e.event_type = 'assistant_delta'
    WHERE g.conv_id = p_conv_id
      AND g.status = 'interrupted'
    GROUP BY g.generation_id
  ) interrupted
  WHERE NOT EXISTS (
    SELECT 1
    FROM comind.cm_conversation_recovery_checkpoint cp
    WHERE cp.conv_id = p_conv_id
      AND cp.generation_id = interrupted.generation_id
      AND cp.last_capture_sequence >= interrupted.last_delta_sequence
      AND cp.partial_assistant_content IS NOT DISTINCT FROM interrupted.partial_content
  );

  IF v_uncovered_interrupted_generations > 0 THEN
    v_hold_reasons := v_hold_reasons || jsonb_build_array('interrupted_partial_not_checkpointed');
  END IF;

  RETURN jsonb_build_object(
    'conversation_id', p_conv_id,
    'evaluated_as_of', p_as_of,
    'eligible', jsonb_array_length(v_hold_reasons) = 0,
    'hold_reasons', v_hold_reasons,
    'policy', jsonb_build_object(
      'policy_id', v_policy_id,
      'name', 'conversation_raw_protected_36h',
      'minimum_protected_hours', v_min_hours
    ),
    'source_range', jsonb_build_object(
      'first_sequence', v_first_sequence,
      'last_sequence', v_last_sequence,
      'event_count', coalesce(v_event_count, 0),
      'source_digest', v_source_digest,
      'latest_capture_at', v_latest_capture_at,
      'eligible_at', v_eligible_at
    ),
    'active_generation_count', v_active_generations,
    'checkpoint', jsonb_build_object(
      'checkpoint_id', v_checkpoint_id,
      'last_capture_sequence', v_checkpoint_last_sequence,
      'snapshot_sha256', v_checkpoint_sha256,
      'created_at', v_checkpoint_created_at
    ),
    'promotion', jsonb_build_object(
      'evaluation_id', v_evaluation_id,
      'checkpoint_id', v_evaluation_checkpoint_id,
      'decision', v_decision,
      'protected_until', v_protected_until,
      'promotions', coalesce(v_promotions, '[]'::jsonb),
      'evidence', coalesce(v_evaluation_evidence, '[]'::jsonb),
      'evaluated_at', v_evaluated_at
    ),
    'uncovered_interrupted_generation_count', v_uncovered_interrupted_generations,
    'destructive_pruning_enabled', false
  );
END;
$$;

-- Preserve the original strict assertion API as a compatibility wrapper over
-- the stronger deterministic evaluator.
CREATE OR REPLACE FUNCTION comind.cm_assert_conversation_prunable(p_conv_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := comind.cm_evaluate_conversation_prune_eligibility(p_conv_id, now());

  IF coalesce((v_result ->> 'eligible')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'conversation % is not prune-eligible; hold reasons: %',
      p_conv_id,
      v_result -> 'hold_reasons';
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Governed manifest creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION comind.cm_create_conversation_prune_manifest(
  p_conv_id uuid,
  p_created_by text,
  p_as_of timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind, extensions
AS $$
DECLARE
  v_result jsonb;
  v_policy_id uuid;
  v_evaluation_id uuid;
  v_checkpoint_id uuid;
  v_first_sequence bigint;
  v_last_sequence bigint;
  v_event_count bigint;
  v_source_digest char(64);
  v_latest_capture_at timestamptz;
  v_eligible_at timestamptz;
  v_durable_destinations jsonb;
  v_manifest_snapshot jsonb;
  v_manifest_sha256 char(64);
  v_manifest_id uuid;
BEGIN
  IF p_created_by IS NULL OR length(btrim(p_created_by)) = 0 THEN
    RAISE EXCEPTION 'p_created_by is required';
  END IF;

  v_result := comind.cm_evaluate_conversation_prune_eligibility(p_conv_id, p_as_of);

  IF coalesce((v_result ->> 'eligible')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'conversation % is not prune-eligible; hold reasons: %',
      p_conv_id,
      v_result -> 'hold_reasons';
  END IF;

  v_policy_id := nullif(v_result #>> '{policy,policy_id}', '')::uuid;
  v_evaluation_id := nullif(v_result #>> '{promotion,evaluation_id}', '')::uuid;
  v_checkpoint_id := nullif(v_result #>> '{checkpoint,checkpoint_id}', '')::uuid;
  v_first_sequence := (v_result #>> '{source_range,first_sequence}')::bigint;
  v_last_sequence := (v_result #>> '{source_range,last_sequence}')::bigint;
  v_event_count := (v_result #>> '{source_range,event_count}')::bigint;
  v_source_digest := (v_result #>> '{source_range,source_digest}')::char(64);
  v_latest_capture_at := (v_result #>> '{source_range,latest_capture_at}')::timestamptz;
  v_eligible_at := (v_result #>> '{source_range,eligible_at}')::timestamptz;
  v_durable_destinations := coalesce(v_result #> '{promotion,promotions}', '[]'::jsonb);

  SELECT manifest_id
    INTO v_manifest_id
  FROM comind.cm_conversation_prune_manifest
  WHERE conv_id = p_conv_id
    AND first_sequence = v_first_sequence
    AND last_sequence = v_last_sequence
    AND evaluation_id = v_evaluation_id
  ORDER BY created_at, manifest_id
  LIMIT 1;

  IF v_manifest_id IS NOT NULL THEN
    RETURN v_manifest_id;
  END IF;

  v_manifest_snapshot := jsonb_build_object(
    'conversation_id', p_conv_id,
    'policy_id', v_policy_id,
    'evaluation_id', v_evaluation_id,
    'checkpoint_id', v_checkpoint_id,
    'first_sequence', v_first_sequence,
    'last_sequence', v_last_sequence,
    'event_count', v_event_count,
    'source_digest', v_source_digest,
    'latest_capture_at', v_latest_capture_at,
    'eligible_at', v_eligible_at,
    'durable_destinations', v_durable_destinations,
    'eligibility', v_result,
    'created_by', p_created_by
  );

  v_manifest_sha256 := encode(
    extensions.digest(v_manifest_snapshot::text, 'sha256'),
    'hex'
  );

  INSERT INTO comind.cm_conversation_prune_manifest (
    conv_id,
    policy_id,
    evaluation_id,
    checkpoint_id,
    first_sequence,
    last_sequence,
    event_count,
    source_digest,
    latest_capture_at,
    eligible_at,
    durable_destinations,
    manifest_snapshot,
    manifest_sha256,
    created_by
  ) VALUES (
    p_conv_id,
    v_policy_id,
    v_evaluation_id,
    v_checkpoint_id,
    v_first_sequence,
    v_last_sequence,
    v_event_count,
    v_source_digest,
    v_latest_capture_at,
    v_eligible_at,
    v_durable_destinations,
    v_manifest_snapshot,
    v_manifest_sha256,
    p_created_by
  )
  RETURNING manifest_id INTO v_manifest_id;

  RETURN v_manifest_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Separate raw-source retention from compact continuity evidence
-- ---------------------------------------------------------------------------

UPDATE comind.cm_retention_policy
SET description = 'CFR minimum protected window for immutable raw conversation capture events. Eligibility requires promotion evaluation, recovery coverage, and an immutable prune manifest. This policy does not authorize deletion.',
    rules = coalesce(rules, '{}'::jsonb) || jsonb_build_object(
      'target_scope', 'raw_capture_only',
      'requires_prune_manifest', true,
      'prune_executor_enabled', false
    )
WHERE name = 'conversation_raw_protected_36h'::extensions.citext;

DELETE FROM comind.cm_retention_binding rb
USING comind.cm_retention_policy rp
WHERE rb.rp_id = rp.rp_id
  AND rp.name = 'conversation_raw_protected_36h'::extensions.citext
  AND rb.target_table = 'comind.cm_conversation_recovery_checkpoint'
  AND rb.target_id IS NULL;

INSERT INTO comind.cm_retention_policy (name, description, rules)
SELECT
  'conversation_continuity_evidence_retained'::extensions.citext,
  'CFR compact continuity evidence survives independently of raw-source prune eligibility. No destructive executor is enabled by this policy.',
  jsonb_build_object(
    'retain_independently_of_raw_source', true,
    'destructive_pruning_enabled', false,
    'future_disposition_requires_separate_policy', true,
    'covers_recovery_checkpoints', true,
    'covers_promotion_evaluations', true,
    'covers_prune_manifests', true
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM comind.cm_retention_policy
  WHERE name = 'conversation_continuity_evidence_retained'::extensions.citext
);

INSERT INTO comind.cm_retention_binding (rp_id, target_table, target_id)
SELECT rp.rp_id, v.target_table, NULL::uuid
FROM comind.cm_retention_policy rp
CROSS JOIN (VALUES
  ('comind.cm_conversation_recovery_checkpoint'::text),
  ('comind.cm_conversation_promotion_evaluation'::text),
  ('comind.cm_conversation_prune_manifest'::text)
) AS v(target_table)
WHERE rp.name = 'conversation_continuity_evidence_retained'::extensions.citext
  AND NOT EXISTS (
    SELECT 1
    FROM comind.cm_retention_binding rb
    WHERE rb.rp_id = rp.rp_id
      AND rb.target_table = v.target_table
      AND rb.target_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- Private service boundary
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION comind.cm_evaluate_conversation_prune_eligibility(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_create_conversation_prune_manifest(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_assert_conversation_prunable(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION comind.cm_evaluate_conversation_prune_eligibility(uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_create_conversation_prune_manifest(uuid, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_assert_conversation_prunable(uuid)
  TO service_role;

GRANT SELECT, INSERT ON TABLE comind.cm_conversation_prune_manifest
  TO service_role;

REVOKE ALL ON TABLE comind.cm_conversation_prune_manifest FROM anon, authenticated;

COMMENT ON TABLE comind.cm_conversation_prune_manifest IS
  'Immutable CFR-001E proof that an exact raw conversation capture range satisfied governed prune-eligibility prerequisites. It is not a delete command.';
COMMENT ON FUNCTION comind.cm_evaluate_conversation_prune_eligibility(uuid, timestamptz) IS
  'Deterministic CFR-001E read surface returning eligibility plus explicit hold reasons. It never deletes data.';
COMMENT ON FUNCTION comind.cm_create_conversation_prune_manifest(uuid, text, timestamptz) IS
  'Creates an immutable prune manifest only after the deterministic CFR-001E eligibility contract passes. It never deletes data.';
COMMENT ON FUNCTION comind.cm_assert_conversation_prunable(uuid) IS
  'Strict compatibility wrapper over CFR-001E eligibility. It never prunes; it only raises unless the stronger governed contract passes.';