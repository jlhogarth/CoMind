\set ON_ERROR_STOP on

INSERT INTO sdn_core.lifecycle_classes(lifecycle_class,class_name,description) VALUES
  ('A','Authoritative Evidence','Consequential evidence preserved by default.'),
  ('B','Durable Agent Work History','Durable working history subject to governed policy.'),
  ('C','Diagnostic Telemetry','Diagnostic detail requiring explicit policy before deletion.'),
  ('D','Metrics and Aggregates','Metric samples eligible for deterministic aggregation.'),
  ('E','Ephemeral Operational State','Operational state eligible for current-state derivation.')
ON CONFLICT DO NOTHING;

INSERT INTO sdn_core.event_type_registry(event_type,lifecycle_class,sensitivity_class,active) VALUES
  ('authoritative.decision','A','internal',true),
  ('metric.sample','D','internal',true),
  ('ops.state','E','internal',true),
  ('diagnostic.sample','C','internal',true)
ON CONFLICT DO NOTHING;

INSERT INTO sdn_lifecycle.retention_policy_versions(policy_version_id,policy_name,version_number,status,effective_at,policy_hash) VALUES (
  '00000000-0000-4000-8000-000000000001','sdn-001-synthetic-retention',1,'active','2026-10-15T00:00:00Z',
  encode(digest('sdn-001-synthetic-retention-v1:A=keep,D=30/60/120,E=30/60','sha256'),'hex')
) ON CONFLICT DO NOTHING;

INSERT INTO sdn_lifecycle.retention_rules(policy_version_id,lifecycle_class,summary_after,compact_after,expire_after,delete_allowed) VALUES
  ('00000000-0000-4000-8000-000000000001','A',NULL,NULL,NULL,false),
  ('00000000-0000-4000-8000-000000000001','D',interval '30 seconds',interval '60 seconds',interval '120 seconds',true),
  ('00000000-0000-4000-8000-000000000001','E',interval '30 seconds',NULL,interval '60 seconds',true)
ON CONFLICT DO NOTHING;
