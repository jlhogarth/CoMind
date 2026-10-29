BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'comind_pm.pm_conversation_governance_bindings'::regclass
      AND conname = 'pm_conversation_governance_binding_conversation_fk'
  ) THEN
    ALTER TABLE comind_pm.pm_conversation_governance_bindings
      ADD CONSTRAINT pm_conversation_governance_binding_conversation_fk
      FOREIGN KEY (conversation_id)
      REFERENCES comind.cm_conversation(conv_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'comind_pm.pm_conversation_egress_review_events'::regclass
      AND conname = 'pm_conversation_egress_review_approval_expiry_required'
  ) THEN
    ALTER TABLE comind_pm.pm_conversation_egress_review_events
      ADD CONSTRAINT pm_conversation_egress_review_approval_expiry_required
      CHECK (decision <> 'approved' OR expires_at IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pm_conversation_binding_asset_idx
  ON comind_pm.pm_conversation_governance_bindings(asset_id);
CREATE INDEX IF NOT EXISTS pm_conversation_review_project_idx
  ON comind_pm.pm_conversation_egress_review_events(project_id);
CREATE INDEX IF NOT EXISTS pm_conversation_review_destination_idx
  ON comind_pm.pm_conversation_egress_review_events(destination_id);

REVOKE ALL ON FUNCTION comind_pm.reject_conversation_egress_review_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb) FROM service_role;
    REVOKE ALL ON FUNCTION comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.resolve_conversation_execution_governance(text,uuid,text) TO service_role;
  END IF;
END $$;

COMMIT;
