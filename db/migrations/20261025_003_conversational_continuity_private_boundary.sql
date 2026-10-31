-- CFR-001: Conversational Continuity Foundation v0.1.2 private boundary
-- Issue #176
--
-- CFR raw capture is private infrastructure. PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default, so remove latent callable privileges even
-- though anon/authenticated currently lack USAGE on the private comind schema.

REVOKE EXECUTE ON FUNCTION comind.cm_record_conversation_capture_event(uuid, text, text, text, uuid, uuid, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_capture_user_message(uuid, text, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_start_assistant_generation(uuid, uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_append_assistant_delta(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_complete_assistant_generation(uuid, text, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_interrupt_assistant_generation(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_fail_assistant_generation(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_create_recovery_checkpoint(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_assert_conversation_prunable(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_reject_cfr_evidence_mutation()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION comind.cm_guard_assistant_generation_transition()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION comind.cm_record_conversation_capture_event(uuid, text, text, text, uuid, uuid, text, text, timestamptz, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_capture_user_message(uuid, text, text, text, jsonb, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_start_assistant_generation(uuid, uuid, text, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_append_assistant_delta(uuid, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_complete_assistant_generation(uuid, text, text, text, jsonb, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_interrupt_assistant_generation(uuid, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_fail_assistant_generation(uuid, text, text, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_create_recovery_checkpoint(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_assert_conversation_prunable(uuid)
  TO service_role;

REVOKE ALL ON TABLE comind.cm_assistant_generation FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_capture_cursor FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_capture_event FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_recovery_checkpoint FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_promotion_evaluation FROM anon, authenticated;
REVOKE ALL ON TABLE comind.v_conversation_recovery_state FROM anon, authenticated;

COMMENT ON SCHEMA comind IS
  'Private CoMind application schema. CFR-001 raw conversational capture is service-side infrastructure and is not directly exposed to anon or authenticated roles.';
