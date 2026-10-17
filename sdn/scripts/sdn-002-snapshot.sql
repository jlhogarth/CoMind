WITH schema_state AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(schema_name,'|' ORDER BY schema_name),''),'sha256'),'hex') AS hash
  FROM information_schema.schemata WHERE schema_name IN ('sdn_core','sdn_telemetry','sdn_evidence','sdn_lifecycle','sdn_summary','sdn_memory','sdn_sync','sdn_ops')
), extension_state AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(extname||':'||extversion,'|' ORDER BY extname),''),'sha256'),'hex') AS hash
  FROM pg_extension WHERE extname IN ('pgcrypto','citext','pg_trgm','vector')
), event_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(producer_id::text||':'||event_id::text||':'||payload_hash||':'||lifecycle_class,'|' ORDER BY producer_id,event_id),''),'sha256'),'hex') AS hash FROM sdn_telemetry.events
), receipt_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(producer_id::text||':'||event_id::text||':'||payload_hash,'|' ORDER BY producer_id,event_id),''),'sha256'),'hex') AS hash FROM sdn_telemetry.ingestion_receipts
), conflict_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(producer_id::text||':'||event_id::text||':'||original_payload_hash||':'||conflicting_payload_hash,'|' ORDER BY producer_id,event_id,conflict_id),''),'sha256'),'hex') AS hash FROM sdn_evidence.integrity_conflicts
), summary_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(summary_hash||':'||source_count::text,'|' ORDER BY summary_hash),''),'sha256'),'hex') AS hash FROM sdn_summary.summaries
), manifest_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(source_set_hash||':'||source_count::text||':'||verification_status,'|' ORDER BY source_set_hash),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.compaction_manifests
), provenance_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(subject_event_id::text||':'||relation||':'||source_event_id::text,'|' ORDER BY subject_event_id,relation,source_event_id),''),'sha256'),'hex') AS hash FROM sdn_evidence.provenance_edges
), policy_version_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(policy_name||':'||version_number::text||':'||status||':'||policy_hash,'|' ORDER BY policy_name,version_number),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.retention_policy_versions
), policy_rule_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(policy_version_id::text||':'||lifecycle_class||':'||coalesce(summary_after::text,'null')||':'||coalesce(compact_after::text,'null')||':'||coalesce(expire_after::text,'null')||':'||delete_allowed::text,'|' ORDER BY policy_version_id,lifecycle_class),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.retention_rules
), job_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(job_key||':'||job_type||':'||status||':'||as_of::text||':'||coalesce(result::text,'null')||':'||coalesce(error_code,'null'),'|' ORDER BY job_key),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.jobs
), evaluation_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(event_id::text||':'||policy_version_id::text||':'||lifecycle_class||':'||outcome||':'||evaluated_at::text,'|' ORDER BY evaluated_at,event_id,evaluation_id),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.evaluations
), transition_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(event_id::text||':'||policy_version_id::text||':'||transition_type||':'||recorded_at::text,'|' ORDER BY recorded_at,event_id,transition_id),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.transition_ledger
), deletion_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(event_id::text||':'||payload_hash||':'||lifecycle_class||':'||deletion_reason,'|' ORDER BY event_id,deletion_receipt_id),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.deletion_receipts
), tombstone_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(event_id::text||':'||payload_hash||':'||lifecycle_class||':'||deletion_receipt_id::text,'|' ORDER BY event_id,tombstone_id),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.tombstones
), artifact_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(artifact_kind||':'||relative_path||':'||content_hash||':'||size_bytes::text||':'||lifecycle_class,'|' ORDER BY artifact_kind,relative_path,content_hash),''),'sha256'),'hex') AS hash FROM sdn_evidence.artifacts
), backup_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(subsystem||':'||backup_type||':'||status||':'||repository_ref||':'||coalesce(backup_set_ref,'null'),'|' ORDER BY occurred_at,backup_event_id),''),'sha256'),'hex') AS hash FROM sdn_ops.backup_events
)
SELECT jsonb_build_object(
  'schemas',jsonb_build_object('count',sc.count,'hash',sc.hash),
  'extensions',jsonb_build_object('count',ex.count,'hash',ex.hash),
  'events',jsonb_build_object('count',e.count,'hash',e.hash),
  'receipts',jsonb_build_object('count',r.count,'hash',r.hash),
  'integrityConflicts',jsonb_build_object('count',ic.count,'hash',ic.hash),
  'summaries',jsonb_build_object('count',s.count,'hash',s.hash),
  'manifests',jsonb_build_object('count',m.count,'hash',m.hash),
  'provenance',jsonb_build_object('count',p.count,'hash',p.hash),
  'policyVersions',jsonb_build_object('count',pv.count,'hash',pv.hash),
  'policyRules',jsonb_build_object('count',pr.count,'hash',pr.hash),
  'lifecycleJobs',jsonb_build_object('count',j.count,'hash',j.hash),
  'lifecycleEvaluations',jsonb_build_object('count',ev.count,'hash',ev.hash),
  'transitionLedger',jsonb_build_object('count',tr.count,'hash',tr.hash),
  'deletionReceipts',jsonb_build_object('count',dr.count,'hash',dr.hash),
  'tombstones',jsonb_build_object('count',ts.count,'hash',ts.hash),
  'artifacts',jsonb_build_object('count',ar.count,'hash',ar.hash),
  'backupMetadata',jsonb_build_object('count',be.count,'hash',be.hash)
)::text
FROM schema_state sc,extension_state ex,event_digest e,receipt_digest r,conflict_digest ic,summary_digest s,manifest_digest m,provenance_digest p,policy_version_digest pv,policy_rule_digest pr,job_digest j,evaluation_digest ev,transition_digest tr,deletion_digest dr,tombstone_digest ts,artifact_digest ar,backup_digest be;
