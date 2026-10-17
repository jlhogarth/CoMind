\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_observer_role') THEN CREATE ROLE sdn_observer_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_backup_role') THEN CREATE ROLE sdn_backup_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_admin_role') THEN CREATE ROLE sdn_admin_role NOLOGIN; END IF;
END $$;

ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS database_physical_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS wal_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS artifact_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS archive_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS pgbackrest_repository_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS restic_repository_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS filesystem_total_bytes bigint;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS free_disk_percent numeric(6,3);
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS warning_state text;
ALTER TABLE sdn_ops.capacity_samples ADD COLUMN IF NOT EXISTS observed_growth_bytes bigint;

CREATE TABLE IF NOT EXISTS sdn_evidence.artifacts (
  artifact_id uuid PRIMARY KEY,
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('artifact','archive','evidence')),
  relative_path text NOT NULL,
  content_hash char(64) NOT NULL,
  hash_algorithm text NOT NULL DEFAULT 'sha256',
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  lifecycle_class char(1) NOT NULL REFERENCES sdn_core.lifecycle_classes(lifecycle_class),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (artifact_kind, relative_path, content_hash)
);

CREATE TABLE IF NOT EXISTS sdn_ops.backup_events (
  backup_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem text NOT NULL CHECK (subsystem IN ('postgresql','artifact_archive')),
  backup_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed')),
  repository_ref text NOT NULL,
  backup_set_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sdn_ops.restore_proofs (
  restore_proof_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsystem text NOT NULL CHECK (subsystem IN ('postgresql','artifact_archive')),
  status text NOT NULL CHECK (status IN ('success','failed')),
  recovery_target text NOT NULL,
  source_independent boolean NOT NULL,
  semantic_hash char(64),
  cryptographic_hash char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS sdn_ops.operational_events (
  operational_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status text NOT NULL CHECK (status IN ('observed','recovered','failed_safe')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['artifacts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_evidence.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_evidence.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['backup_events','restore_proofs','operational_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON sdn_ops.%I', relation_name, relation_name);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON sdn_ops.%I FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation()', relation_name, relation_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION sdn_ops.current_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, sdn_ops, sdn_lifecycle, sdn_evidence, sdn_telemetry
AS $$
SELECT jsonb_build_object(
  'postgresqlHealth', 'queryable',
  'databaseBytes', pg_database_size(current_database()),
  'lifecycleBacklog', (SELECT count(*) FROM sdn_lifecycle.jobs WHERE status IN ('pending','running')),
  'lifecycleFailures', (SELECT count(*) FROM sdn_lifecycle.jobs WHERE status IN ('failed','interrupted')),
  'integrityConflicts', (SELECT count(*) FROM sdn_evidence.integrity_conflicts),
  'activeHolds', (SELECT count(*) FROM sdn_lifecycle.holds WHERE released_at IS NULL AND starts_at <= clock_timestamp() AND (ends_at IS NULL OR ends_at > clock_timestamp())),
  'expirationReadyBacklog', (
    SELECT count(*) FROM (
      SELECT DISTINCT ON (event_pk) event_pk, outcome
      FROM sdn_lifecycle.evaluations
      ORDER BY event_pk, evaluated_at DESC, evaluation_id DESC
    ) latest WHERE outcome='eligible'
  ),
  'destructiveActionCount', (SELECT count(*) FROM sdn_lifecycle.deletion_receipts),
  'destructiveCapabilityConfigured', has_function_privilege('sdn_purge_role','sdn_lifecycle.purge_eligible_event(uuid)','EXECUTE'),
  'latestCapacity', (SELECT to_jsonb(c) FROM sdn_ops.capacity_samples c ORDER BY sampled_at DESC, sample_id DESC LIMIT 1),
  'latestPostgresqlBackup', (
    SELECT jsonb_build_object('status',status,'backupType',backup_type,'backupSetRef',backup_set_ref,'occurredAt',occurred_at)
    FROM sdn_ops.backup_events WHERE subsystem='postgresql' ORDER BY occurred_at DESC, backup_event_id DESC LIMIT 1
  ),
  'latestArtifactBackup', (
    SELECT jsonb_build_object('status',status,'backupType',backup_type,'backupSetRef',backup_set_ref,'occurredAt',occurred_at)
    FROM sdn_ops.backup_events WHERE subsystem='artifact_archive' ORDER BY occurred_at DESC, backup_event_id DESC LIMIT 1
  ),
  'latestSuccessfulRestore', (
    SELECT jsonb_build_object('subsystem',subsystem,'sourceIndependent',source_independent,'verifiedAt',verified_at)
    FROM sdn_ops.restore_proofs WHERE status='success' ORDER BY verified_at DESC, restore_proof_id DESC LIMIT 1
  )
);
$$;

REVOKE ALL ON FUNCTION sdn_ops.current_status() FROM PUBLIC;
GRANT USAGE ON SCHEMA sdn_ops TO sdn_observer_role, sdn_backup_role, sdn_admin_role;
GRANT EXECUTE ON FUNCTION sdn_ops.current_status() TO sdn_observer_role;
GRANT INSERT,SELECT ON sdn_ops.backup_events,sdn_ops.restore_proofs,sdn_ops.operational_events,sdn_ops.capacity_samples TO sdn_backup_role;
GRANT INSERT,SELECT ON sdn_evidence.artifacts TO sdn_backup_role;
GRANT sdn_observer_role TO sdn_backup_role;
GRANT sdn_observer_role,sdn_backup_role TO sdn_admin_role;
