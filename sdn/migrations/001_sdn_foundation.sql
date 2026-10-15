\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS sdn_core;
CREATE SCHEMA IF NOT EXISTS sdn_telemetry;
CREATE SCHEMA IF NOT EXISTS sdn_evidence;
CREATE SCHEMA IF NOT EXISTS sdn_lifecycle;
CREATE SCHEMA IF NOT EXISTS sdn_summary;
CREATE SCHEMA IF NOT EXISTS sdn_memory;
CREATE SCHEMA IF NOT EXISTS sdn_sync;
CREATE SCHEMA IF NOT EXISTS sdn_ops;

REVOKE ALL ON SCHEMA sdn_core, sdn_telemetry, sdn_evidence, sdn_lifecycle, sdn_summary, sdn_memory, sdn_sync, sdn_ops FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_ingest_role') THEN CREATE ROLE sdn_ingest_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_lifecycle_role') THEN CREATE ROLE sdn_lifecycle_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_purge_role') THEN CREATE ROLE sdn_purge_role NOLOGIN; END IF;
END $$;

CREATE OR REPLACE FUNCTION sdn_core.deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only relation % does not permit %', TG_TABLE_NAME, TG_OP USING ERRCODE='42501';
END;
$$;

CREATE TABLE IF NOT EXISTS sdn_core.lifecycle_classes (
  lifecycle_class char(1) PRIMARY KEY CHECK (lifecycle_class IN ('A','B','C','D','E')),
  class_name text NOT NULL UNIQUE,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sdn_core.event_type_registry (
  event_type citext PRIMARY KEY,
  lifecycle_class char(1) NOT NULL REFERENCES sdn_core.lifecycle_classes(lifecycle_class),
  sensitivity_class text NOT NULL CHECK (sensitivity_class IN ('public','internal','sensitive','restricted')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.retention_policy_versions (
  policy_version_id uuid PRIMARY KEY,
  policy_name text NOT NULL,
  version_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','active','retired')),
  effective_at timestamptz NOT NULL,
  policy_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (policy_name, version_number)
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.retention_rules (
  policy_version_id uuid NOT NULL REFERENCES sdn_lifecycle.retention_policy_versions(policy_version_id),
  lifecycle_class char(1) NOT NULL REFERENCES sdn_core.lifecycle_classes(lifecycle_class),
  summary_after interval,
  compact_after interval,
  expire_after interval,
  delete_allowed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_version_id, lifecycle_class),
  CHECK (NOT delete_allowed OR expire_after IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sdn_telemetry.events (
  event_pk uuid PRIMARY KEY,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  schema_version text NOT NULL,
  event_type citext NOT NULL REFERENCES sdn_core.event_type_registry(event_type),
  lifecycle_class char(1) NOT NULL REFERENCES sdn_core.lifecycle_classes(lifecycle_class),
  sensitivity_class text NOT NULL,
  source_timestamp timestamptz NOT NULL,
  sequence_number bigint,
  correlation_id uuid,
  causation_event_id uuid,
  source_environment text NOT NULL,
  trace_id text,
  payload jsonb NOT NULL,
  payload_hash char(64) NOT NULL,
  canonicalization_version text NOT NULL,
  policy_version_id uuid NOT NULL REFERENCES sdn_lifecycle.retention_policy_versions(policy_version_id),
  producer_lifecycle_hint char(1),
  ingested_at timestamptz NOT NULL,
  UNIQUE (producer_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_sdn_events_class_ingested ON sdn_telemetry.events(lifecycle_class, ingested_at);
CREATE INDEX IF NOT EXISTS idx_sdn_events_type_ingested ON sdn_telemetry.events(event_type, ingested_at);
CREATE INDEX IF NOT EXISTS idx_sdn_events_payload_gin ON sdn_telemetry.events USING gin(payload);

CREATE TABLE IF NOT EXISTS sdn_telemetry.ingestion_receipts (
  receipt_id uuid PRIMARY KEY,
  event_pk uuid NOT NULL UNIQUE,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  lifecycle_class char(1) NOT NULL,
  policy_version_id uuid NOT NULL,
  ingested_at timestamptz NOT NULL,
  UNIQUE (producer_id, event_id)
);

CREATE TABLE IF NOT EXISTS sdn_evidence.integrity_conflicts (
  conflict_id uuid PRIMARY KEY,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  original_event_pk uuid NOT NULL,
  original_payload_hash char(64) NOT NULL,
  conflicting_payload_hash char(64) NOT NULL,
  conflicting_payload jsonb NOT NULL,
  detected_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sdn_evidence.provenance_edges (
  provenance_edge_id uuid PRIMARY KEY,
  subject_event_pk uuid NOT NULL,
  subject_producer_id uuid NOT NULL,
  subject_event_id uuid NOT NULL,
  relation text NOT NULL,
  source_producer_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sdn_summary.summaries (
  summary_id uuid PRIMARY KEY,
  summary_kind text NOT NULL,
  lifecycle_class char(1) NOT NULL,
  algorithm_id text NOT NULL,
  algorithm_version text NOT NULL,
  content jsonb NOT NULL,
  summary_hash char(64) NOT NULL,
  source_count integer NOT NULL CHECK (source_count > 0),
  created_at timestamptz NOT NULL,
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS sdn_summary.summary_sources (
  summary_id uuid NOT NULL REFERENCES sdn_summary.summaries(summary_id),
  source_event_pk uuid NOT NULL,
  source_producer_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  source_payload_hash char(64) NOT NULL,
  PRIMARY KEY (summary_id, source_event_pk)
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.compaction_manifests (
  manifest_id uuid PRIMARY KEY,
  source_event_pk uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  algorithm_id text NOT NULL,
  algorithm_version text NOT NULL,
  source_count integer NOT NULL CHECK (source_count > 0),
  source_set_hash char(64) NOT NULL,
  derivative_summary_id uuid NOT NULL REFERENCES sdn_summary.summaries(summary_id),
  verification_status text NOT NULL CHECK (verification_status IN ('prepared','verified','failed')),
  created_at timestamptz NOT NULL,
  verified_at timestamptz
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.compaction_manifest_sources (
  manifest_id uuid NOT NULL REFERENCES sdn_lifecycle.compaction_manifests(manifest_id),
  source_event_pk uuid NOT NULL,
  source_producer_id uuid NOT NULL,
  source_event_id uuid NOT NULL,
  source_payload_hash char(64) NOT NULL,
  PRIMARY KEY (manifest_id, source_event_pk)
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.holds (
  hold_id uuid PRIMARY KEY,
  event_pk uuid NOT NULL,
  hold_type text NOT NULL,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.jobs (
  job_id uuid PRIMARY KEY,
  job_key char(64) NOT NULL UNIQUE,
  job_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','interrupted')),
  as_of timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  lease_expires_at timestamptz,
  result jsonb,
  error_code text,
  error_detail text
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.evaluations (
  evaluation_id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  event_pk uuid NOT NULL,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  lifecycle_class char(1) NOT NULL,
  outcome text NOT NULL,
  details jsonb NOT NULL,
  evaluated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sdn_evaluations_event_time ON sdn_lifecycle.evaluations(event_pk, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.transition_ledger (
  transition_id uuid PRIMARY KEY,
  event_pk uuid NOT NULL,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  transition_type text NOT NULL,
  policy_version_id uuid NOT NULL,
  details jsonb NOT NULL,
  recorded_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sdn_transition_event_time ON sdn_lifecycle.transition_ledger(event_pk, recorded_at);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.deletion_receipts (
  deletion_receipt_id uuid PRIMARY KEY,
  event_pk uuid NOT NULL UNIQUE,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  lifecycle_class char(1) NOT NULL,
  policy_version_id uuid NOT NULL,
  eligible_evaluation_id uuid NOT NULL,
  deletion_reason text NOT NULL,
  deleted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sdn_lifecycle.tombstones (
  tombstone_id uuid PRIMARY KEY,
  event_pk uuid NOT NULL UNIQUE,
  producer_id uuid NOT NULL,
  event_id uuid NOT NULL,
  payload_hash char(64) NOT NULL,
  lifecycle_class char(1) NOT NULL,
  policy_version_id uuid NOT NULL,
  deletion_receipt_id uuid NOT NULL UNIQUE,
  deleted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sdn_ops.ingest_counters (
  counter_name text PRIMARY KEY,
  counter_value bigint NOT NULL DEFAULT 0 CHECK (counter_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sdn_ops.capacity_samples (
  sample_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  database_bytes bigint NOT NULL CHECK (database_bytes >= 0),
  free_disk_bytes bigint NOT NULL CHECK (free_disk_bytes >= 0),
  sampled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['lifecycle_classes','event_type_registry'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_core.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_core.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['retention_policy_versions','retention_rules','transition_ledger','deletion_receipts','tombstones'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_lifecycle.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_lifecycle.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['ingestion_receipts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_telemetry.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_telemetry.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['integrity_conflicts','provenance_edges'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_evidence.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_evidence.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION sdn_lifecycle.purge_eligible_event(p_event_pk uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdn_lifecycle, sdn_telemetry, sdn_summary
AS $$
DECLARE
  e sdn_telemetry.events%ROWTYPE;
  rule sdn_lifecycle.retention_rules%ROWTYPE;
  eval_row sdn_lifecycle.evaluations%ROWTYPE;
  deletion_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO e FROM sdn_telemetry.events WHERE event_pk=p_event_pk FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % does not exist', p_event_pk USING ERRCODE='P0002'; END IF;
  IF e.lifecycle_class='A' THEN RAISE EXCEPTION 'Class A event % is not purgeable', p_event_pk USING ERRCODE='42501'; END IF;
  SELECT * INTO rule FROM sdn_lifecycle.retention_rules WHERE policy_version_id=e.policy_version_id AND lifecycle_class=e.lifecycle_class;
  IF NOT FOUND OR rule.delete_allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'event % has no deletion-authorizing policy', p_event_pk USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM sdn_lifecycle.holds h WHERE h.event_pk=e.event_pk AND h.released_at IS NULL AND h.starts_at <= clock_timestamp() AND (h.ends_at IS NULL OR h.ends_at > clock_timestamp())) THEN RAISE EXCEPTION 'event % has active hold', p_event_pk USING ERRCODE='42501'; END IF;
  SELECT * INTO eval_row FROM sdn_lifecycle.evaluations WHERE event_pk=e.event_pk AND policy_version_id=e.policy_version_id AND outcome='eligible' ORDER BY evaluated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'event % lacks matching eligible evaluation', p_event_pk USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sdn_summary.summary_sources ss JOIN sdn_summary.summaries s ON s.summary_id=ss.summary_id WHERE ss.source_event_pk=e.event_pk AND s.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'event % lacks verified derivative', p_event_pk USING ERRCODE='42501'; END IF;
  IF e.lifecycle_class='D' AND NOT EXISTS (SELECT 1 FROM sdn_lifecycle.compaction_manifests m WHERE m.source_event_pk=e.event_pk AND m.policy_version_id=e.policy_version_id AND m.verification_status='verified' AND m.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'event % lacks verified compaction manifest', p_event_pk USING ERRCODE='42501'; END IF;
  INSERT INTO sdn_lifecycle.deletion_receipts(deletion_receipt_id,event_pk,producer_id,event_id,payload_hash,lifecycle_class,policy_version_id,eligible_evaluation_id,deletion_reason,deleted_at) VALUES (deletion_id,e.event_pk,e.producer_id,e.event_id,e.payload_hash,e.lifecycle_class,e.policy_version_id,eval_row.evaluation_id,'test-policy-expiration',clock_timestamp());
  INSERT INTO sdn_lifecycle.tombstones(tombstone_id,event_pk,producer_id,event_id,payload_hash,lifecycle_class,policy_version_id,deletion_receipt_id,deleted_at) VALUES (gen_random_uuid(),e.event_pk,e.producer_id,e.event_id,e.payload_hash,e.lifecycle_class,e.policy_version_id,deletion_id,clock_timestamp());
  INSERT INTO sdn_lifecycle.transition_ledger(transition_id,event_pk,producer_id,event_id,transition_type,policy_version_id,details,recorded_at) VALUES (gen_random_uuid(),e.event_pk,e.producer_id,e.event_id,'physically_expired',e.policy_version_id,jsonb_build_object('deletionReceiptId',deletion_id,'payloadHash',e.payload_hash),clock_timestamp());
  DELETE FROM sdn_telemetry.events WHERE event_pk=e.event_pk;
  RETURN deletion_id;
END;
$$;

REVOKE ALL ON FUNCTION sdn_lifecycle.purge_eligible_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sdn_lifecycle.purge_eligible_event(uuid) TO sdn_purge_role;
GRANT USAGE ON SCHEMA sdn_core,sdn_telemetry,sdn_evidence,sdn_lifecycle,sdn_ops TO sdn_ingest_role;
GRANT SELECT ON sdn_core.event_type_registry,sdn_lifecycle.retention_policy_versions,sdn_lifecycle.retention_rules TO sdn_ingest_role;
GRANT SELECT,INSERT ON sdn_telemetry.events TO sdn_ingest_role;
GRANT SELECT,INSERT ON sdn_telemetry.ingestion_receipts TO sdn_ingest_role;
GRANT INSERT ON sdn_evidence.integrity_conflicts,sdn_evidence.provenance_edges TO sdn_ingest_role;
GRANT INSERT ON sdn_lifecycle.transition_ledger TO sdn_ingest_role;
GRANT SELECT,INSERT,UPDATE ON sdn_ops.ingest_counters TO sdn_ingest_role;
GRANT SELECT ON sdn_lifecycle.evaluations,sdn_ops.capacity_samples TO sdn_ingest_role;
GRANT USAGE ON SCHEMA sdn_telemetry,sdn_lifecycle,sdn_summary TO sdn_lifecycle_role;
GRANT SELECT ON sdn_telemetry.events TO sdn_lifecycle_role;
GRANT SELECT ON sdn_lifecycle.retention_rules,sdn_lifecycle.holds TO sdn_lifecycle_role;
GRANT SELECT,INSERT,UPDATE ON sdn_lifecycle.jobs TO sdn_lifecycle_role;
GRANT SELECT,INSERT ON sdn_lifecycle.evaluations,sdn_lifecycle.transition_ledger TO sdn_lifecycle_role;
GRANT SELECT,INSERT,UPDATE ON sdn_lifecycle.compaction_manifests TO sdn_lifecycle_role;
GRANT SELECT,INSERT ON sdn_lifecycle.compaction_manifest_sources TO sdn_lifecycle_role;
GRANT SELECT,INSERT,UPDATE ON sdn_summary.summaries TO sdn_lifecycle_role;
GRANT SELECT,INSERT ON sdn_summary.summary_sources TO sdn_lifecycle_role;
GRANT USAGE ON SCHEMA sdn_telemetry,sdn_lifecycle,sdn_summary TO sdn_purge_role;
GRANT SELECT ON sdn_telemetry.events,sdn_lifecycle.evaluations TO sdn_purge_role;
