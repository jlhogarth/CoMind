-- CFR-001F deterministic isolated classification fixtures.
-- Requires the base reconciliation fixture and migrations 008-010.
-- Synthetic only. No production or user archive data.

-- -------------------------------------------------------------------------
-- Case 2: compatible extension where archive later completes interrupted text.
-- -------------------------------------------------------------------------
INSERT INTO comind.cm_conversation (
  conv_id, source, title, external_ref, metadata, created_at
) VALUES (
  'f0020001-0000-4000-8000-000000000001',
  'native_chatgpt_live',
  'CFR-001F later archive completion',
  'native-conversation-extension',
  '{"native_chatgpt_source_conversation_id":"native-conversation-extension","source_system":"chatgpt"}'::jsonb,
  '2026-10-25T18:10:00Z'
);
INSERT INTO comind.cm_message (msg_id,conv_id,role,content,created_at) VALUES
  ('f0020001-0000-4000-8000-000000000011','f0020001-0000-4000-8000-000000000001','user','Explain the recovery contract.','2026-10-25T18:10:00Z');
INSERT INTO comind.cm_assistant_generation (
  generation_id,conv_id,user_msg_id,status,provider,model,interruption_reason,
  claimed_at,last_activity_at,interrupted_at,metadata
) VALUES (
  'f0020001-0000-4000-8000-000000000021','f0020001-0000-4000-8000-000000000001',
  'f0020001-0000-4000-8000-000000000011','interrupted','fixture','fixture','synthetic_disconnect',
  '2026-10-25T18:10:05Z','2026-10-25T18:10:20Z','2026-10-25T18:10:20Z','{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_conversation_recovery_checkpoint (
  checkpoint_id,conv_id,generation_id,checkpoint_reason,last_capture_sequence,
  last_complete_msg_id,partial_assistant_content,snapshot,snapshot_sha256,created_at
) VALUES (
  'f0020001-0000-4000-8000-000000000031','f0020001-0000-4000-8000-000000000001',
  'f0020001-0000-4000-8000-000000000021','synthetic_interruption',0,
  'f0020001-0000-4000-8000-000000000011','The recovery contract preserves the partial answer',
  '{"synthetic":true}'::jsonb,repeat('2',64),'2026-10-25T18:10:21Z'
);

INSERT INTO comind.cm_archive_source (
  source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_metadata
) VALUES ('f0020001-0000-4000-8000-000000000101','chatgpt','cfr-001f-extension.zip',repeat('4',64),200,'{"synthetic":true}'::jsonb);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,
  reconciliation,receipt,receipt_sha256
) VALUES (
  'f0020001-0000-4000-8000-000000000102','f0020001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,2,2,0,1,2,2,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('4',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,
  node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0020001-0000-4000-8000-000000000102','native-conversation-extension','CFR-001F later archive completion',
  '2026-10-25T18:10:00Z','2026-10-25T18:10:30Z',repeat('4',64),repeat('5',64),repeat('6',64),2,2,0,
  '{"id":"native-conversation-extension","mapping":{}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
  created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES
  ('f0020001-0000-4000-8000-000000000102','native-conversation-extension','ext-user',NULL,'["ext-assistant"]'::jsonb,'ext-message-user','user',
   '2026-10-25T18:10:00Z','2026-10-25T18:10:00Z','text',repeat('7',64),repeat('8',64),
   '{"id":"ext-user","message":{"id":"ext-message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Explain the recovery contract."]}}}'::jsonb),
  ('f0020001-0000-4000-8000-000000000102','native-conversation-extension','ext-assistant','ext-user','[]'::jsonb,'ext-message-assistant','assistant',
   '2026-10-25T18:10:20Z','2026-10-25T18:10:20Z','text',repeat('9',64),repeat('a',64),
   '{"id":"ext-assistant","message":{"id":"ext-message-assistant","author":{"role":"assistant"},"content":{"content_type":"text","parts":["The recovery contract preserves the partial answer and later evidence."]}}}'::jsonb);

-- -------------------------------------------------------------------------
-- Case 3: compatible extension because live has interrupted text absent archive.
-- -------------------------------------------------------------------------
INSERT INTO comind.cm_conversation (
  conv_id, source, title, external_ref, metadata, created_at
) VALUES (
  'f0030001-0000-4000-8000-000000000001','native_chatgpt_live','CFR-001F live-only partial',
  'native-conversation-live-partial',
  '{"native_chatgpt_source_conversation_id":"native-conversation-live-partial","source_system":"chatgpt"}'::jsonb,
  '2026-10-25T18:20:00Z'
);
INSERT INTO comind.cm_message (msg_id,conv_id,role,content,created_at) VALUES
  ('f0030001-0000-4000-8000-000000000011','f0030001-0000-4000-8000-000000000001','user','Keep completed and interrupted evidence separate.','2026-10-25T18:20:00Z'),
  ('f0030001-0000-4000-8000-000000000012','f0030001-0000-4000-8000-000000000001','assistant','Completed answer retained.','2026-10-25T18:20:10Z');
INSERT INTO comind.cm_assistant_generation (
  generation_id,conv_id,user_msg_id,status,provider,model,interruption_reason,claimed_at,last_activity_at,interrupted_at,metadata
) VALUES (
  'f0030001-0000-4000-8000-000000000021','f0030001-0000-4000-8000-000000000001',
  'f0030001-0000-4000-8000-000000000011','interrupted','fixture','fixture','synthetic_disconnect',
  '2026-10-25T18:20:15Z','2026-10-25T18:20:25Z','2026-10-25T18:20:25Z','{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_conversation_recovery_checkpoint (
  checkpoint_id,conv_id,generation_id,checkpoint_reason,last_capture_sequence,last_complete_msg_id,
  partial_assistant_content,snapshot,snapshot_sha256,created_at
) VALUES (
  'f0030001-0000-4000-8000-000000000031','f0030001-0000-4000-8000-000000000001',
  'f0030001-0000-4000-8000-000000000021','synthetic_interruption',0,
  'f0030001-0000-4000-8000-000000000012','This unfinished text exists only in live CFR evidence.',
  '{"synthetic":true}'::jsonb,repeat('b',64),'2026-10-25T18:20:26Z'
);
INSERT INTO comind.cm_archive_source VALUES (
  'f0030001-0000-4000-8000-000000000101','chatgpt','cfr-001f-live-partial.zip',repeat('5',64),300,NULL,now(),'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,reconciliation,receipt,receipt_sha256
) VALUES (
  'f0030001-0000-4000-8000-000000000102','f0030001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,2,2,0,1,2,2,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('5',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0030001-0000-4000-8000-000000000102','native-conversation-live-partial','CFR-001F live-only partial',
  '2026-10-25T18:20:00Z','2026-10-25T18:20:10Z',repeat('b',64),repeat('c',64),repeat('d',64),2,2,0,
  '{"id":"native-conversation-live-partial","mapping":{}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
  created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES
  ('f0030001-0000-4000-8000-000000000102','native-conversation-live-partial','lop-user',NULL,'["lop-assistant"]'::jsonb,'lop-message-user','user',
   '2026-10-25T18:20:00Z','2026-10-25T18:20:00Z','text',repeat('e',64),repeat('f',64),
   '{"id":"lop-user","message":{"id":"lop-message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Keep completed and interrupted evidence separate."]}}}'::jsonb),
  ('f0030001-0000-4000-8000-000000000102','native-conversation-live-partial','lop-assistant','lop-user','[]'::jsonb,'lop-message-assistant','assistant',
   '2026-10-25T18:20:10Z','2026-10-25T18:20:10Z','text',repeat('0',64),repeat('1',64),
   '{"id":"lop-assistant","message":{"id":"lop-message-assistant","author":{"role":"assistant"},"content":{"content_type":"text","parts":["Completed answer retained."]}}}'::jsonb);

-- -------------------------------------------------------------------------
-- Case 4: explicit identity with materially conflicting assistant content.
-- -------------------------------------------------------------------------
INSERT INTO comind.cm_conversation (conv_id,source,title,external_ref,metadata,created_at) VALUES (
  'f0040001-0000-4000-8000-000000000001','native_chatgpt_live','CFR-001F conflict','native-conversation-conflict',
  '{"native_chatgpt_source_conversation_id":"native-conversation-conflict","source_system":"chatgpt"}'::jsonb,'2026-10-25T18:30:00Z'
);
INSERT INTO comind.cm_message (msg_id,conv_id,role,content,created_at) VALUES
  ('f0040001-0000-4000-8000-000000000011','f0040001-0000-4000-8000-000000000001','user','Compare these observations.','2026-10-25T18:30:00Z'),
  ('f0040001-0000-4000-8000-000000000012','f0040001-0000-4000-8000-000000000001','assistant','Live observation differs materially.','2026-10-25T18:30:10Z');
INSERT INTO comind.cm_archive_source VALUES (
  'f0040001-0000-4000-8000-000000000101','chatgpt','cfr-001f-conflict.zip',repeat('6',64),400,NULL,now(),'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,reconciliation,receipt,receipt_sha256
) VALUES (
  'f0040001-0000-4000-8000-000000000102','f0040001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,2,2,0,1,2,2,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('6',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0040001-0000-4000-8000-000000000102','native-conversation-conflict','CFR-001F conflict',
  '2026-10-25T18:30:00Z','2026-10-25T18:30:10Z',repeat('2',64),repeat('3',64),repeat('4',64),2,2,0,
  '{"id":"native-conversation-conflict","mapping":{}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
  created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES
  ('f0040001-0000-4000-8000-000000000102','native-conversation-conflict','conf-user',NULL,'["conf-assistant"]'::jsonb,'conf-message-user','user',
   '2026-10-25T18:30:00Z','2026-10-25T18:30:00Z','text',repeat('5',64),repeat('6',64),
   '{"id":"conf-user","message":{"id":"conf-message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Compare these observations."]}}}'::jsonb),
  ('f0040001-0000-4000-8000-000000000102','native-conversation-conflict','conf-assistant','conf-user','[]'::jsonb,'conf-message-assistant','assistant',
   '2026-10-25T18:30:10Z','2026-10-25T18:30:10Z','text',repeat('7',64),repeat('8',64),
   '{"id":"conf-assistant","message":{"id":"conf-message-assistant","author":{"role":"assistant"},"content":{"content_type":"text","parts":["Archive observation differs materially."]}}}'::jsonb);

-- -------------------------------------------------------------------------
-- Case 5: weak title/time correlation only, which must remain ambiguous.
-- -------------------------------------------------------------------------
INSERT INTO comind.cm_conversation (conv_id,source,title,external_ref,metadata,created_at) VALUES (
  'f0050001-0000-4000-8000-000000000001','live','CFR-001F weak correlation',NULL,'{}'::jsonb,'2026-10-25T18:40:30Z'
);
INSERT INTO comind.cm_message (msg_id,conv_id,role,content,created_at) VALUES (
  'f0050001-0000-4000-8000-000000000011','f0050001-0000-4000-8000-000000000001','user','Different live content.','2026-10-25T18:40:30Z'
);
INSERT INTO comind.cm_archive_source VALUES (
  'f0050001-0000-4000-8000-000000000101','chatgpt','cfr-001f-ambiguous.zip',repeat('7',64),500,NULL,now(),'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,reconciliation,receipt,receipt_sha256
) VALUES (
  'f0050001-0000-4000-8000-000000000102','f0050001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,1,1,0,1,1,1,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('7',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0050001-0000-4000-8000-000000000102','native-conversation-ambiguous','CFR-001F weak correlation',
  '2026-10-25T18:40:00Z','2026-10-25T18:40:00Z',repeat('9',64),repeat('a',64),repeat('b',64),1,1,0,
  '{"id":"native-conversation-ambiguous","mapping":{}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
  created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES (
  'f0050001-0000-4000-8000-000000000102','native-conversation-ambiguous','amb-user',NULL,'[]'::jsonb,'amb-message-user','user',
  '2026-10-25T18:40:00Z','2026-10-25T18:40:00Z','text',repeat('c',64),repeat('d',64),
  '{"id":"amb-user","message":{"id":"amb-message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Archive-specific content."]}}}'::jsonb
);

-- -------------------------------------------------------------------------
-- Case 6: archive with no credible live candidate.
-- -------------------------------------------------------------------------
INSERT INTO comind.cm_archive_source VALUES (
  'f0060001-0000-4000-8000-000000000101','chatgpt','cfr-001f-unmatched.zip',repeat('8',64),600,NULL,now(),'{"synthetic":true}'::jsonb
);
INSERT INTO comind.cm_archive_import (
  import_id,source_archive_id,parser_version,schema_version,status,started_at,completed_at,
  source_conversation_count,source_message_count,source_node_count,source_attachment_count,
  imported_conversation_count,imported_message_count,imported_node_count,imported_attachment_count,reconciliation,receipt,receipt_sha256
) VALUES (
  'f0060001-0000-4000-8000-000000000102','f0060001-0000-4000-8000-000000000101','fixture','fixture','PASS',now(),now(),
  1,1,1,0,1,1,1,0,'{"verified":true}'::jsonb,'{"status":"PASS"}'::jsonb,repeat('8',64)
);
INSERT INTO comind.cm_archive_conversation_observation (
  import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,node_count,message_count,attachment_reference_count,raw_conversation
) VALUES (
  'f0060001-0000-4000-8000-000000000102','native-conversation-unmatched','CFR-001F unmatched archive',
  '2026-10-25T19:00:00Z','2026-10-25T19:00:00Z',repeat('e',64),repeat('f',64),repeat('0',64),1,1,0,
  '{"id":"native-conversation-unmatched","mapping":{}}'::jsonb
);
INSERT INTO comind.cm_archive_node_observation (
  import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,source_message_id,role,
  created_at,updated_at,content_type,raw_node_hash,normalized_message_hash,raw_node
) VALUES (
  'f0060001-0000-4000-8000-000000000102','native-conversation-unmatched','unmatched-user',NULL,'[]'::jsonb,'unmatched-message-user','user',
  '2026-10-25T19:00:00Z','2026-10-25T19:00:00Z','text',repeat('1',64),repeat('2',64),
  '{"id":"unmatched-user","message":{"id":"unmatched-message-user","author":{"role":"user"},"content":{"content_type":"text","parts":["Only the native archive contains this conversation."]}}}'::jsonb
);
