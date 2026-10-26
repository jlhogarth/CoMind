-- Add a linear archive branch to the source evidence seeded by
-- scripts/test_cfr_001f_reconciliation.sh. The archive conversation itself
-- intentionally lacks current_node, so the reconciler must derive the single
-- leaf without flattening or mutating source topology.

INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,
  source_message_id,role,source_created_at,source_updated_at,created_at,updated_at,
  content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES
(
  'f0010001-0000-4000-8000-000000000102','native-conversation-1','node-user',NULL,
  '["node-assistant"]'::jsonb,'message-user','user','1792941600'::jsonb,'1792941600'::jsonb,
  '2026-10-25T18:00:00Z','2026-10-25T18:00:00Z','text',repeat('a',64),repeat('b',64),
  '{"id":"node-user","message":{"id":"message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Preserve every consequential turn."]}}}'::jsonb
),
(
  'f0010001-0000-4000-8000-000000000102','native-conversation-1','node-assistant','node-user',
  '[]'::jsonb,'message-assistant','assistant','1792941610'::jsonb,'1792941610'::jsonb,
  '2026-10-25T18:00:10Z','2026-10-25T18:00:10Z','text',repeat('c',64),repeat('d',64),
  '{"id":"node-assistant","message":{"id":"message-assistant","author":{"role":"assistant"},"content":{"content_type":"text","parts":["Capture first, interpret second."]}}}'::jsonb
)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_reconciliation_test_login') THEN
    CREATE ROLE comind_reconciliation_test_login
      LOGIN
      NOINHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD 'cfr001f-local-only';
  ELSE
    ALTER ROLE comind_reconciliation_test_login
      LOGIN
      NOINHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      PASSWORD 'cfr001f-local-only';
  END IF;
END;
$$;

REVOKE comind_conversation_reconciler FROM comind_reconciliation_test_login;
GRANT comind_conversation_reconciler TO comind_reconciliation_test_login
  WITH INHERIT FALSE, SET TRUE;
GRANT CONNECT ON DATABASE comind_ci TO comind_reconciliation_test_login;
