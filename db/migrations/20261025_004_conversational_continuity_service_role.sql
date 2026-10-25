-- CFR-001: Conversational Continuity Foundation v0.1.3 service boundary
-- Issue #176
--
-- Capture functions are SECURITY INVOKER by design. Grant the private service
-- identity only the object privileges needed to execute the capture lifecycle.
-- No anon/authenticated grants are introduced.

GRANT USAGE ON SCHEMA comind TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE comind.cm_conversation
  TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_message
  TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE comind.cm_assistant_generation
  TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE comind.cm_conversation_capture_cursor
  TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_conversation_capture_event
  TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_conversation_recovery_checkpoint
  TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_conversation_promotion_evaluation
  TO service_role;
GRANT SELECT ON TABLE comind.cm_retention_policy
  TO service_role;
GRANT SELECT ON TABLE comind.v_conversation_recovery_state
  TO service_role;

-- Explicitly preserve the public-client boundary after service grants.
REVOKE ALL ON TABLE comind.cm_conversation_capture_event FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_recovery_checkpoint FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_promotion_evaluation FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_assistant_generation FROM anon, authenticated;
REVOKE ALL ON TABLE comind.cm_conversation_capture_cursor FROM anon, authenticated;
REVOKE ALL ON TABLE comind.v_conversation_recovery_state FROM anon, authenticated;
