-- ACP-001 deterministic continuity checkpoints.
-- Repository and isolated verification only until separately authorized for deployment.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_reject_continuity_checkpoint_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'continuity checkpoints are immutable';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_continuity_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  workflow_id text NOT NULL,
  execution_id text NOT NULL,
  parent_checkpoint_id uuid REFERENCES comind.cm_continuity_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  state_digest char(64) NOT NULL CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  digest char(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  checkpoint jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_continuity_checkpoint_identity UNIQUE (conversation_id, execution_id),
  CONSTRAINT cm_continuity_checkpoint_expiry CHECK (expires_at > created_at),
  CONSTRAINT cm_continuity_checkpoint_json_object CHECK (jsonb_typeof(checkpoint) = 'object'),
  CONSTRAINT cm_continuity_checkpoint_version CHECK ((checkpoint->>'version') = '1'),
  CONSTRAINT cm_continuity_checkpoint_conversation CHECK ((checkpoint#>>'{state,conversationId}') = conversation_id),
  CONSTRAINT cm_continuity_checkpoint_workflow CHECK ((checkpoint#>>'{state,workflowId}') = workflow_id),
  CONSTRAINT cm_continuity_checkpoint_execution CHECK ((checkpoint#>>'{state,executionId}') = execution_id),
  CONSTRAINT cm_continuity_checkpoint_parent CHECK ((checkpoint#>>'{state,parentCheckpointId}') IS NOT DISTINCT FROM parent_checkpoint_id::text),
  CONSTRAINT cm_continuity_checkpoint_state_digest CHECK ((checkpoint->>'stateDigest') = state_digest),
  CONSTRAINT cm_continuity_checkpoint_digest CHECK ((checkpoint->>'digest') = digest)
);

CREATE INDEX IF NOT EXISTS idx_cm_continuity_checkpoint_recent
  ON comind.cm_continuity_checkpoint (conversation_id, created_at DESC, checkpoint_id DESC);

DROP TRIGGER IF EXISTS trg_cm_continuity_checkpoint_immutable
  ON comind.cm_continuity_checkpoint;
CREATE TRIGGER trg_cm_continuity_checkpoint_immutable
BEFORE UPDATE OR DELETE ON comind.cm_continuity_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_continuity_checkpoint_mutation();

ALTER TABLE comind.cm_continuity_checkpoint ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE comind.cm_continuity_checkpoint FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE comind.cm_continuity_checkpoint TO service_role;
REVOKE ALL ON FUNCTION comind.cm_reject_continuity_checkpoint_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_reject_continuity_checkpoint_mutation() TO service_role;

COMMENT ON TABLE comind.cm_continuity_checkpoint IS
  'Immutable ACP machine-restorable continuity state. This is distinct from Foundry provenance summary checkpoints and stores no lease ownership token or raw credential material.';

COMMIT;
