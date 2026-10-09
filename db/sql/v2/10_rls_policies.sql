-- CoMind One-Shot v2 - 10_rls_policies.sql
BEGIN;
SET search_path TO comind, public;

-- These tables are internal application data. RLS is enabled at schema creation time,
-- but no broad client policy is granted here. Backend-governed access remains explicit.
ALTER TABLE cm_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_assistant_generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_doc ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_doc_chunk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_select_all ON cm_conversation;
DROP POLICY IF EXISTS conv_modify_own ON cm_conversation;
DROP POLICY IF EXISTS conv_update_own ON cm_conversation;
DROP POLICY IF EXISTS msg_select_all ON cm_message;
DROP POLICY IF EXISTS msg_modify_all ON cm_message;
DROP POLICY IF EXISTS msg_update_all ON cm_message;
DROP POLICY IF EXISTS assistant_generation_select_all ON cm_assistant_generation;
DROP POLICY IF EXISTS assistant_generation_modify_all ON cm_assistant_generation;
DROP POLICY IF EXISTS assistant_generation_update_all ON cm_assistant_generation;
DROP POLICY IF EXISTS doc_select_all ON cm_doc;
DROP POLICY IF EXISTS doc_modify_all ON cm_doc;
DROP POLICY IF EXISTS doc_update_all ON cm_doc;
DROP POLICY IF EXISTS chunk_select_all ON cm_doc_chunk;
DROP POLICY IF EXISTS chunk_modify_all ON cm_doc_chunk;
DROP POLICY IF EXISTS chunk_update_all ON cm_doc_chunk;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE cm_conversation, cm_message, cm_assistant_generation, cm_doc, cm_doc_chunk FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE cm_conversation, cm_message, cm_assistant_generation, cm_doc, cm_doc_chunk FROM authenticated;
  END IF;
END;
$$;
REVOKE ALL ON TABLE cm_conversation, cm_message, cm_assistant_generation, cm_doc, cm_doc_chunk FROM PUBLIC;

COMMIT;