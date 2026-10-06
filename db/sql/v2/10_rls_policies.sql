-- CoMind One‑Shot v2 - 10_rls_policies.sql
BEGIN;
SET search_path TO comind, public;

-- Enable RLS on user-owned tables
ALTER TABLE cm_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_doc ENABLE ROW LEVEL SECURITY;
ALTER TABLE cm_doc_chunk ENABLE ROW LEVEL SECURITY;

-- Simple policies: actor must belong to the same org as the conversation/project/doc owner
-- For brevity, we allow read-all for now; tighten as needed.

CREATE POLICY conv_select_all ON cm_conversation FOR SELECT USING (true);
CREATE POLICY conv_modify_own ON cm_conversation FOR INSERT WITH CHECK (true);
CREATE POLICY conv_update_own ON cm_conversation FOR UPDATE USING (true);

CREATE POLICY msg_select_all ON cm_message FOR SELECT USING (true);
CREATE POLICY msg_modify_all ON cm_message FOR INSERT WITH CHECK (true);
CREATE POLICY msg_update_all ON cm_message FOR UPDATE USING (true);

CREATE POLICY doc_select_all ON cm_doc FOR SELECT USING (true);
CREATE POLICY doc_modify_all ON cm_doc FOR INSERT WITH CHECK (true);
CREATE POLICY doc_update_all ON cm_doc FOR UPDATE USING (true);

CREATE POLICY chunk_select_all ON cm_doc_chunk FOR SELECT USING (true);
CREATE POLICY chunk_modify_all ON cm_doc_chunk FOR INSERT WITH CHECK (true);
CREATE POLICY chunk_update_all ON cm_doc_chunk FOR UPDATE USING (true);

COMMIT;