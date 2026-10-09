-- ACP-001 immutable checkpoints. Apply only to isolated development PostgreSQL until authorized.
CREATE TABLE IF NOT EXISTS continuity_checkpoints (
  checkpoint_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id text NOT NULL,
  execution_id text NOT NULL,
  parent_checkpoint_id bigint REFERENCES continuity_checkpoints(checkpoint_id),
  created_at timestamptz NOT NULL,
  digest char(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  checkpoint jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT continuity_checkpoint_identity UNIQUE (conversation_id, execution_id, digest),
  CONSTRAINT continuity_checkpoint_version CHECK ((checkpoint->>'version') = '1'),
  CONSTRAINT continuity_checkpoint_conversation CHECK ((checkpoint#>>'{state,conversationId}') = conversation_id),
  CONSTRAINT continuity_checkpoint_execution CHECK ((checkpoint#>>'{state,executionId}') = execution_id),
  CONSTRAINT continuity_checkpoint_digest CHECK ((checkpoint->>'digest') = digest)
);
CREATE INDEX IF NOT EXISTS continuity_checkpoints_recent
  ON continuity_checkpoints (conversation_id, checkpoint_id DESC);
CREATE OR REPLACE FUNCTION reject_continuity_checkpoint_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'continuity checkpoints are immutable';
END $$;
DROP TRIGGER IF EXISTS continuity_checkpoints_immutable ON continuity_checkpoints;
CREATE TRIGGER continuity_checkpoints_immutable
BEFORE UPDATE OR DELETE ON continuity_checkpoints
FOR EACH ROW EXECUTE FUNCTION reject_continuity_checkpoint_mutation();
