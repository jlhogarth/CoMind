-- CFR-001G v0.1.1: remove redundant permissive source-read policies.
-- cm_conversation and cm_message already have existing permissive SELECT
-- policies. Table privileges remain the authority boundary for the dedicated
-- derivation role, so these extra policies are unnecessary and add RLS cost.

BEGIN;
SET search_path TO comind, public;

DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_conversation;
DROP POLICY IF EXISTS cm_conversation_deriver_select ON cm_message;

COMMIT;
