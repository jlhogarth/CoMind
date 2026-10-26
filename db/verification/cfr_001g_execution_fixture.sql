-- CFR-001G deterministic isolated execution fixture.
-- Synthetic data only.

BEGIN;
SET search_path TO comind, public;

INSERT INTO cm_conversation (conv_id, source, title, created_at, metadata)
VALUES (
  '71000000-0000-4000-8000-000000000001'::uuid,
  'live',
  'CFR-001G deterministic acceptance fixture',
  '2026-10-25T20:00:00Z'::timestamptz,
  '{"synthetic":true,"cfr_lane":"CFR-001G"}'::jsonb
);

INSERT INTO cm_message (msg_id, conv_id, role, content, created_at, meta) VALUES
(
  '71000000-0000-4000-8000-000000000011'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  'user',
  'I want CFR-001G to keep evidence. We must never automatically promote analytics. Please build the governed derivation layer.',
  '2026-10-25T20:00:01Z'::timestamptz,
  '{"synthetic":true}'::jsonb
),
(
  '71000000-0000-4000-8000-000000000012'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  'assistant',
  'I approve the deterministic approach. CFR-001G reads from CoMind Conversation Continuity and we will verify the result next.',
  '2026-10-25T20:00:02Z'::timestamptz,
  '{"synthetic":true}'::jsonb
),
(
  '71000000-0000-4000-8000-000000000013'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  'user',
  'What should happen after a timeout? However, this must not become a canonical decision automatically.',
  '2026-10-25T20:00:03Z'::timestamptz,
  '{"synthetic":true}'::jsonb
);

INSERT INTO cm_assistant_generation (
  generation_id, conv_id, user_msg_id, claim_token, status, provider, model,
  claimed_at, last_activity_at, interrupted_at, interruption_reason, metadata
) VALUES (
  '71000000-0000-4000-8000-000000000021'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  '71000000-0000-4000-8000-000000000013'::uuid,
  '71000000-0000-4000-8000-000000000022'::uuid,
  'interrupted',
  'synthetic',
  'deterministic-fixture',
  '2026-10-25T20:00:04Z'::timestamptz,
  '2026-10-25T20:00:05Z'::timestamptz,
  '2026-10-25T20:00:05Z'::timestamptz,
  'synthetic_connection_drop',
  '{"synthetic":true}'::jsonb
);

INSERT INTO cm_conversation_capture_cursor (conv_id, last_sequence_no, updated_at)
VALUES ('71000000-0000-4000-8000-000000000001'::uuid, 5, '2026-10-25T20:00:05Z'::timestamptz);

INSERT INTO cm_conversation_capture_event (
  capture_event_id, conv_id, generation_id, msg_id, sequence_no, event_type, role,
  content_delta, source_system, source_event_ref, source_observed_at, raw_payload,
  event_sha256, captured_at
) VALUES
(
  '71000000-0000-4000-8000-000000000101'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  '71000000-0000-4000-8000-000000000011'::uuid,
  1, 'user_message_observed', 'user', 'I want CFR-001G to keep evidence.',
  'synthetic', 'cfr001g-1', '2026-10-25T20:00:01Z'::timestamptz, '{}'::jsonb,
  repeat('1',64)::char(64), '2026-10-25T20:00:01Z'::timestamptz
),
(
  '71000000-0000-4000-8000-000000000102'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  '71000000-0000-4000-8000-000000000012'::uuid,
  2, 'assistant_message_observed', 'assistant', 'I approve the deterministic approach.',
  'synthetic', 'cfr001g-2', '2026-10-25T20:00:02Z'::timestamptz, '{}'::jsonb,
  repeat('2',64)::char(64), '2026-10-25T20:00:02Z'::timestamptz
),
(
  '71000000-0000-4000-8000-000000000103'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  '71000000-0000-4000-8000-000000000013'::uuid,
  3, 'user_message_observed', 'user', 'What should happen after a timeout?',
  'synthetic', 'cfr001g-3', '2026-10-25T20:00:03Z'::timestamptz, '{}'::jsonb,
  repeat('3',64)::char(64), '2026-10-25T20:00:03Z'::timestamptz
),
(
  '71000000-0000-4000-8000-000000000104'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  '71000000-0000-4000-8000-000000000021'::uuid,
  NULL,
  4, 'assistant_generation_started', 'assistant', NULL,
  'synthetic', 'cfr001g-4', '2026-10-25T20:00:04Z'::timestamptz, '{}'::jsonb,
  repeat('4',64)::char(64), '2026-10-25T20:00:04Z'::timestamptz
),
(
  '71000000-0000-4000-8000-000000000105'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  '71000000-0000-4000-8000-000000000021'::uuid,
  NULL,
  5, 'assistant_generation_interrupted', 'assistant', 'The partial answer is preserved but it is not a canonical completed assistant message.',
  'synthetic', 'cfr001g-5', '2026-10-25T20:00:05Z'::timestamptz, '{}'::jsonb,
  repeat('5',64)::char(64), '2026-10-25T20:00:05Z'::timestamptz
);

INSERT INTO cm_conversation_recovery_checkpoint (
  checkpoint_id, conv_id, generation_id, checkpoint_reason, last_capture_sequence,
  last_complete_msg_id, partial_assistant_content, snapshot, snapshot_sha256, created_at
) VALUES (
  '71000000-0000-4000-8000-000000000031'::uuid,
  '71000000-0000-4000-8000-000000000001'::uuid,
  '71000000-0000-4000-8000-000000000021'::uuid,
  'synthetic_interruption',
  5,
  '71000000-0000-4000-8000-000000000013'::uuid,
  'The partial answer is preserved but it is not a canonical completed assistant message.',
  '{"synthetic":true,"interrupted":true}'::jsonb,
  repeat('a',64)::char(64),
  '2026-10-25T20:00:05Z'::timestamptz
);

COMMIT;
