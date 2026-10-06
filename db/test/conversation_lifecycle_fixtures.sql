-- Deterministic integration fixtures for GitHub issue #8.
-- These records are synthetic, test-scoped, and intended only for disposable PostgreSQL databases.
BEGIN;
SET search_path TO comind, public;

DELETE FROM cm_message
WHERE conv_id IN (
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443'
);

DELETE FROM cm_conversation
WHERE conv_id IN (
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442',
  '44444444-4444-4444-8444-444444444443'
);

DELETE FROM cm_project
WHERE project_id = '33333333-3333-4333-8333-333333333333';

DELETE FROM cm_actor
WHERE actor_id = '22222222-2222-4222-8222-222222222222';

DELETE FROM cm_org
WHERE org_id = '11111111-1111-4111-8111-111111111111';

INSERT INTO cm_org (org_id, name, slug, created_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'CoMind Integration Test Organization',
  'comind-integration-test',
  '2026-10-06T00:00:00Z'
);

INSERT INTO cm_actor (
  actor_id,
  org_id,
  kind,
  handle,
  display_name,
  created_at,
  updated_at
)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'person',
  'integration.test.operator',
  'Integration Test Operator',
  '2026-10-06T00:05:00Z',
  '2026-10-06T00:05:00Z'
);

INSERT INTO cm_project (
  project_id,
  org_id,
  title,
  slug,
  description,
  status,
  priority,
  created_by,
  created_at,
  updated_at
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'CoMind Conversation Integration Test',
  'comind-conversation-integration-test',
  'Deterministic project used to validate conversation lifecycle routes.',
  'active',
  8,
  '22222222-2222-4222-8222-222222222222',
  '2026-10-06T00:10:00Z',
  '2026-10-06T00:10:00Z'
);

INSERT INTO cm_conversation (
  conv_id,
  org_id,
  project_id,
  owner_actor_id,
  source,
  title,
  created_at,
  external_ref,
  metadata
)
VALUES
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'live',
    'Memory architecture discussion',
    '2026-10-06T01:00:00Z',
    'issue-8-fixture-conversation-1',
    '{"fixture":"conversation-lifecycle","sequence":1}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'import_api',
    'Supabase migration planning',
    '2026-10-06T02:00:00Z',
    'issue-8-fixture-conversation-2',
    '{"fixture":"conversation-lifecycle","sequence":2}'::jsonb
  ),
  (
    '44444444-4444-4444-8444-444444444443',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'live',
    'Issue #8 integration verification',
    '2026-10-06T03:00:00Z',
    'issue-8-fixture-conversation-3',
    '{"fixture":"conversation-lifecycle","sequence":3}'::jsonb
  );

INSERT INTO cm_message (msg_id, conv_id, role, content, created_at, meta)
VALUES
  (
    '55555555-5555-4555-8555-555555555551',
    '44444444-4444-4444-8444-444444444441',
    'user',
    'How should persistent cognition preserve a conversation across sessions?',
    '2026-10-06T01:00:10Z',
    '{"fixture_order":1}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555552',
    '44444444-4444-4444-8444-444444444441',
    'assistant',
    'Store conversation identity, ordered messages, provenance, and governed memory references.',
    '2026-10-06T01:00:20Z',
    '{"fixture_order":2}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555553',
    '44444444-4444-4444-8444-444444444441',
    'user',
    'That gives the memory layer evidence it can trace back to the source conversation.',
    '2026-10-06T01:00:30Z',
    '{"fixture_order":3}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555554',
    '44444444-4444-4444-8444-444444444442',
    'user',
    'We moved the application database parent to Supabase and need isolated verification.',
    '2026-10-06T02:00:10Z',
    '{"fixture_order":1}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '44444444-4444-4444-8444-444444444442',
    'assistant',
    'Use disposable PostgreSQL for tests so production data and live memory records remain untouched.',
    '2026-10-06T02:00:20Z',
    '{"fixture_order":2}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555556',
    '44444444-4444-4444-8444-444444444443',
    'user',
    'Verify the conversation list is ordered newest first.',
    '2026-10-06T03:00:10Z',
    '{"fixture_order":1}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555557',
    '44444444-4444-4444-8444-444444444443',
    'assistant',
    'Then verify message detail ordering and parent conversation relationships.',
    '2026-10-06T03:00:20Z',
    '{"fixture_order":2}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555558',
    '44444444-4444-4444-8444-444444444443',
    'user',
    'Search should find memory references using case-insensitive matching.',
    '2026-10-06T03:00:30Z',
    '{"fixture_order":3}'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555559',
    '44444444-4444-4444-8444-444444444443',
    'assistant',
    'Analytics should report three conversations and nine total messages.',
    '2026-10-06T03:00:40Z',
    '{"fixture_order":4}'::jsonb
  );

COMMIT;
