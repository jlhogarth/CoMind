-- CFR-001G local/CI-only RLS compatibility.
--
-- Canonical local v2 intentionally has no broad SELECT policies on
-- cm_conversation or cm_message. Supabase Test currently has existing SELECT
-- policies, so migration 013 correctly removes redundant deriver-specific
-- policies there. The dedicated isolated CFR-001G acceptance database needs a
-- narrow role-specific policy to exercise the same effective worker capability
-- without weakening the canonical local schema or changing Supabase Test.

BEGIN;
SET search_path TO comind, public;

DROP POLICY IF EXISTS cm_conversation_deriver_ci_select ON cm_conversation;
CREATE POLICY cm_conversation_deriver_ci_select
  ON cm_conversation
  FOR SELECT
  TO comind_conversation_deriver
  USING (true);

DROP POLICY IF EXISTS cm_message_deriver_ci_select ON cm_message;
CREATE POLICY cm_message_deriver_ci_select
  ON cm_message
  FOR SELECT
  TO comind_conversation_deriver
  USING (true);

COMMIT;
