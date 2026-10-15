WITH event_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(producer_id::text||':'||event_id::text||':'||payload_hash||':'||lifecycle_class,'|' ORDER BY producer_id,event_id),''),'sha256'),'hex') AS hash FROM sdn_telemetry.events
), receipt_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(producer_id::text||':'||event_id::text||':'||payload_hash,'|' ORDER BY producer_id,event_id),''),'sha256'),'hex') AS hash FROM sdn_telemetry.ingestion_receipts
), summary_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(summary_hash||':'||source_count::text,'|' ORDER BY summary_hash),''),'sha256'),'hex') AS hash FROM sdn_summary.summaries
), manifest_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(source_set_hash||':'||source_count::text||':'||verification_status,'|' ORDER BY source_set_hash),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.compaction_manifests
), provenance_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(subject_event_id::text||':'||relation||':'||source_event_id::text,'|' ORDER BY subject_event_id,relation,source_event_id),''),'sha256'),'hex') AS hash FROM sdn_evidence.provenance_edges
), policy_digest AS (
  SELECT count(*)::bigint AS count, encode(digest(coalesce(string_agg(policy_name||':'||version_number::text||':'||policy_hash,'|' ORDER BY policy_name,version_number),''),'sha256'),'hex') AS hash FROM sdn_lifecycle.retention_policy_versions
)
SELECT jsonb_build_object('events',jsonb_build_object('count',e.count,'hash',e.hash),'receipts',jsonb_build_object('count',r.count,'hash',r.hash),'summaries',jsonb_build_object('count',s.count,'hash',s.hash),'manifests',jsonb_build_object('count',m.count,'hash',m.hash),'provenance',jsonb_build_object('count',p.count,'hash',p.hash),'policies',jsonb_build_object('count',v.count,'hash',v.hash))::text
FROM event_digest e,receipt_digest r,summary_digest s,manifest_digest m,provenance_digest p,policy_digest v;
