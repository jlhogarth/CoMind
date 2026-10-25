-- CFR-001 interruption recovery acceptance proof
-- Issue #176
-- Test only. Leaves synthetic evidence intentionally so the proof is auditable.

CREATE TEMP TABLE cfr_001_proof_ids (
  conv_id uuid,
  user_msg_id uuid,
  generation_id uuid,
  checkpoint_id uuid
) ON COMMIT PRESERVE ROWS;

WITH c AS (
  INSERT INTO comind.cm_conversation (source, title, external_ref, metadata)
  VALUES (
    'cfr_test',
    'CFR-001 synthetic interruption recovery proof',
    'cfr-001:test:interruption:' || gen_random_uuid()::text,
    jsonb_build_object('synthetic', true, 'issue', 176, 'purpose', 'forced interruption recovery proof')
  )
  RETURNING conv_id
), u AS (
  SELECT c.conv_id,
         comind.cm_capture_user_message(
           c.conv_id,
           'Prove that a partially streamed assistant response survives an interruption.',
           'cfr_test',
           'user-1',
           jsonb_build_object('synthetic', true),
           jsonb_build_object('source', 'cfr-001-verification')
         ) AS user_msg_id
  FROM c
), g AS (
  SELECT u.conv_id, u.user_msg_id,
         comind.cm_start_assistant_generation(
           u.conv_id,
           u.user_msg_id,
           'synthetic_provider',
           'synthetic_model',
           'cfr_test',
           'generation-1-start',
           jsonb_build_object('synthetic', true, 'expected_terminal_state', 'interrupted')
         ) AS generation_id
  FROM u
), d1 AS (
  SELECT g.*,
         comind.cm_append_assistant_delta(
           g.generation_id,
           'The first part of this answer ',
           'cfr_test',
           'delta-1',
           '{}'::jsonb
         ) AS event_id
  FROM g
), d2 AS (
  SELECT d1.*,
         comind.cm_append_assistant_delta(
           d1.generation_id,
           'was safely captured before ',
           'cfr_test',
           'delta-2',
           '{}'::jsonb
         ) AS event_id_2
  FROM d1
), d3 AS (
  SELECT d2.*,
         comind.cm_append_assistant_delta(
           d2.generation_id,
           'the simulated connection failed.',
           'cfr_test',
           'delta-3',
           '{}'::jsonb
         ) AS event_id_3
  FROM d2
), i AS (
  SELECT d3.*,
         comind.cm_interrupt_assistant_generation(
           d3.generation_id,
           'simulated_client_disconnect',
           'cfr_test',
           'generation-1-interrupted',
           '{}'::jsonb
         ) AS interruption_event
  FROM d3
), cp AS (
  SELECT i.*,
         comind.cm_create_recovery_checkpoint(
           i.conv_id,
           i.generation_id,
           'forced_interruption_test'
         ) AS checkpoint_id
  FROM i
)
INSERT INTO cfr_001_proof_ids (conv_id, user_msg_id, generation_id, checkpoint_id)
SELECT conv_id, user_msg_id, generation_id, checkpoint_id
FROM cp;

DO $$
DECLARE
  v_conv_id uuid;
  v_generation_id uuid;
  v_checkpoint_id uuid;
  v_status text;
  v_user_count bigint;
  v_assistant_count bigint;
  v_event_count bigint;
  v_min_seq bigint;
  v_max_seq bigint;
  v_distinct_seq bigint;
  v_partial text;
  v_checkpoint_partial text;
  v_checkpoint_seq bigint;
  v_last_role text;
BEGIN
  SELECT conv_id, generation_id, checkpoint_id
    INTO v_conv_id, v_generation_id, v_checkpoint_id
  FROM cfr_001_proof_ids
  LIMIT 1;

  SELECT status INTO v_status
  FROM comind.cm_assistant_generation
  WHERE generation_id = v_generation_id;

  SELECT count(*) FILTER (WHERE role = 'user'),
         count(*) FILTER (WHERE role = 'assistant')
    INTO v_user_count, v_assistant_count
  FROM comind.cm_message
  WHERE conv_id = v_conv_id;

  SELECT count(*), min(sequence_no), max(sequence_no), count(distinct sequence_no)
    INTO v_event_count, v_min_seq, v_max_seq, v_distinct_seq
  FROM comind.cm_conversation_capture_event
  WHERE conv_id = v_conv_id;

  SELECT string_agg(coalesce(content_delta, ''), '' ORDER BY sequence_no)
    INTO v_partial
  FROM comind.cm_conversation_capture_event
  WHERE generation_id = v_generation_id
    AND event_type = 'assistant_delta';

  SELECT partial_assistant_content, last_capture_sequence,
         (SELECT role FROM comind.cm_message WHERE msg_id = cp.last_complete_msg_id)
    INTO v_checkpoint_partial, v_checkpoint_seq, v_last_role
  FROM comind.cm_conversation_recovery_checkpoint cp
  WHERE checkpoint_id = v_checkpoint_id;

  IF v_status <> 'interrupted' THEN
    RAISE EXCEPTION 'expected interrupted status, got %', v_status;
  END IF;
  IF v_user_count <> 1 OR v_assistant_count <> 0 THEN
    RAISE EXCEPTION 'unexpected canonical message counts user=% assistant=%', v_user_count, v_assistant_count;
  END IF;
  IF v_event_count <> 6 OR v_min_seq <> 1 OR v_max_seq <> 6 OR v_distinct_seq <> 6 THEN
    RAISE EXCEPTION 'capture sequence failed count=% min=% max=% distinct=%', v_event_count, v_min_seq, v_max_seq, v_distinct_seq;
  END IF;
  IF v_partial <> 'The first part of this answer was safely captured before the simulated connection failed.' THEN
    RAISE EXCEPTION 'partial reconstruction mismatch: %', v_partial;
  END IF;
  IF v_checkpoint_partial IS DISTINCT FROM v_partial OR v_checkpoint_seq <> 6 OR v_last_role <> 'user' THEN
    RAISE EXCEPTION 'checkpoint mismatch partial=% seq=% role=%', v_checkpoint_partial, v_checkpoint_seq, v_last_role;
  END IF;
END;
$$;

DO $$
DECLARE
  v_conv_id uuid;
  v_blocked boolean := false;
BEGIN
  SELECT conv_id INTO v_conv_id FROM cfr_001_proof_ids LIMIT 1;

  BEGIN
    UPDATE comind.cm_conversation_capture_event
    SET content_delta = 'tampered'
    WHERE conv_id = v_conv_id AND sequence_no = 3;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM LIKE '%append-only%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'append-only mutation guard did not block the update';
  END IF;
END;
$$;

DO $$
DECLARE
  v_conv_id uuid;
  v_blocked boolean := false;
BEGIN
  SELECT conv_id INTO v_conv_id FROM cfr_001_proof_ids LIMIT 1;

  BEGIN
    PERFORM comind.cm_assert_conversation_prunable(v_conv_id);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM LIKE '%protected raw-retention window%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION '36-hour protected-retention gate did not block pruning eligibility';
  END IF;
END;
$$;

SELECT
  'PASS' AS cfr_001_interruption_recovery,
  p.conv_id,
  p.generation_id,
  p.checkpoint_id,
  r.generation_status,
  r.last_capture_sequence,
  r.partial_assistant_content,
  r.last_complete_role
FROM cfr_001_proof_ids p
JOIN comind.v_conversation_recovery_state r
  ON r.generation_id = p.generation_id;
