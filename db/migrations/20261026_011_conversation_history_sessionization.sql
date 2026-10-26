-- CHIST-A02: deterministic cross-conversation sessionization and temporal rollups.
-- Session boundaries are derivation policy, not claims about psychology or productivity.
BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_archive_session_policy (
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  inactivity_gap_seconds integer NOT NULL CHECK (inactivity_gap_seconds >= 1),
  exact_boundary_starts_new boolean NOT NULL DEFAULT true,
  is_reference boolean NOT NULL DEFAULT false,
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_key, policy_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_archive_session_policy_reference
  ON comind.cm_archive_session_policy(is_reference)
  WHERE is_reference;

WITH policies(policy_key,policy_version,inactivity_gap_seconds,exact_boundary_starts_new,is_reference,definition) AS (
  VALUES
    ('session_gap','30m-v1',1800,true,true,
      'Reference session policy. A new session starts when the gap between consecutive timestamped source messages is greater than or equal to 1800 seconds. The threshold is an analytics convention, not a psychological boundary.'),
    ('session_gap','60m-v1',3600,true,false,
      'Comparison session policy. A new session starts when the gap between consecutive timestamped source messages is greater than or equal to 3600 seconds.'),
    ('session_gap','120m-v1',7200,true,false,
      'Comparison session policy. A new session starts when the gap between consecutive timestamped source messages is greater than or equal to 7200 seconds.')
)
INSERT INTO comind.cm_archive_session_policy (
  policy_key,policy_version,inactivity_gap_seconds,exact_boundary_starts_new,is_reference,definition,definition_sha256
)
SELECT
  policy_key,policy_version,inactivity_gap_seconds,exact_boundary_starts_new,is_reference,definition,
  encode(extensions.digest(concat_ws('|',policy_key,policy_version,inactivity_gap_seconds::text,exact_boundary_starts_new::text,definition),'sha256'),'hex')
FROM policies
ON CONFLICT (policy_key,policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_archive_sessionization_run (
  sessionization_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES comind.cm_conversation_history_baseline(baseline_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_archive_sha256 char(64) NOT NULL CHECK (source_archive_sha256 ~ '^[a-f0-9]{64}$'),
  import_receipt_sha256 char(64) NOT NULL CHECK (import_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  certification_sha256 char(64) NOT NULL CHECK (certification_sha256 ~ '^[a-f0-9]{64}$'),
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  policy_definition_sha256 char(64) NOT NULL CHECK (policy_definition_sha256 ~ '^[a-f0-9]{64}$'),
  inactivity_gap_seconds integer NOT NULL CHECK (inactivity_gap_seconds >= 1),
  exact_boundary_starts_new boolean NOT NULL,
  source_message_count bigint NOT NULL CHECK (source_message_count >= 0),
  source_event_count bigint NOT NULL CHECK (source_event_count >= 0),
  excluded_untimestamped_message_count bigint NOT NULL CHECK (excluded_untimestamped_message_count >= 0),
  result_state text NOT NULL CHECK (result_state IN ('completed','no_timestamped_events')),
  run_identity_sha256 char(64) NOT NULL UNIQUE CHECK (run_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_sessionization_policy_fk
    FOREIGN KEY (policy_key,policy_version)
    REFERENCES comind.cm_archive_session_policy(policy_key,policy_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_sessionization_coverage CHECK (
    source_message_count = source_event_count + excluded_untimestamped_message_count
  ),
  CONSTRAINT cm_archive_sessionization_state CHECK (
    (source_event_count=0 AND result_state='no_timestamped_events')
    OR (source_event_count>0 AND result_state='completed')
  ),
  CONSTRAINT cm_archive_sessionization_run_scope_unique
    UNIQUE (sessionization_run_id, import_id),
  CONSTRAINT cm_archive_sessionization_baseline_policy_unique
    UNIQUE (baseline_id, policy_key, policy_version)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_session_observation (
  sessionization_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  session_ordinal bigint NOT NULL CHECK (session_ordinal >= 1),
  session_identity_sha256 char(64) NOT NULL CHECK (session_identity_sha256 ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  span_seconds numeric(20,6) NOT NULL CHECK (span_seconds >= 0),
  opening_gap_seconds numeric(20,6),
  event_count bigint NOT NULL CHECK (event_count >= 1),
  conversation_count bigint NOT NULL CHECK (conversation_count >= 1),
  user_message_count bigint NOT NULL CHECK (user_message_count >= 0),
  assistant_message_count bigint NOT NULL CHECK (assistant_message_count >= 0),
  system_message_count bigint NOT NULL CHECK (system_message_count >= 0),
  tool_message_count bigint NOT NULL CHECK (tool_message_count >= 0),
  first_source_conversation_id text NOT NULL,
  first_source_node_id text NOT NULL,
  first_source_message_id text NOT NULL,
  last_source_conversation_id text NOT NULL,
  last_source_node_id text NOT NULL,
  last_source_message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sessionization_run_id,session_ordinal),
  CONSTRAINT cm_archive_session_observation_run_scope_fk
    FOREIGN KEY (sessionization_run_id,import_id)
    REFERENCES comind.cm_archive_sessionization_run(sessionization_run_id,import_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_session_observation_identity_unique
    UNIQUE (sessionization_run_id,session_identity_sha256),
  CONSTRAINT cm_archive_session_observation_time_order CHECK (ended_at >= started_at),
  CONSTRAINT cm_archive_session_observation_opening_gap CHECK (
    (session_ordinal=1 AND opening_gap_seconds IS NULL)
    OR (session_ordinal>1 AND opening_gap_seconds IS NOT NULL AND opening_gap_seconds >= 0)
  ),
  CONSTRAINT cm_archive_session_observation_role_counts CHECK (
    user_message_count + assistant_message_count + system_message_count + tool_message_count <= event_count
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_session_event (
  sessionization_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  session_ordinal bigint NOT NULL CHECK (session_ordinal >= 1),
  event_ordinal bigint NOT NULL CHECK (event_ordinal >= 1),
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  source_message_id text NOT NULL,
  event_at timestamptz NOT NULL,
  role text,
  gap_from_previous_seconds numeric(20,6),
  event_identity_sha256 char(64) NOT NULL CHECK (event_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sessionization_run_id,event_ordinal),
  CONSTRAINT cm_archive_session_event_session_fk
    FOREIGN KEY (sessionization_run_id,session_ordinal)
    REFERENCES comind.cm_archive_session_observation(sessionization_run_id,session_ordinal)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_session_event_source_node_fk
    FOREIGN KEY (import_id,source_conversation_id,source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id,source_conversation_id,source_node_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_session_event_source_unique
    UNIQUE (sessionization_run_id,import_id,source_conversation_id,source_node_id),
  CONSTRAINT cm_archive_session_event_gap CHECK (
    (event_ordinal=1 AND gap_from_previous_seconds IS NULL)
    OR (event_ordinal>1 AND gap_from_previous_seconds IS NOT NULL AND gap_from_previous_seconds >= 0)
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_temporal_rollup (
  sessionization_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  grain text NOT NULL CHECK (grain IN ('hour_utc','day_utc','month_utc','year_utc')),
  bucket_start_utc timestamptz NOT NULL,
  event_count bigint NOT NULL CHECK (event_count >= 1),
  session_count bigint NOT NULL CHECK (session_count >= 1),
  conversation_count bigint NOT NULL CHECK (conversation_count >= 1),
  user_message_count bigint NOT NULL CHECK (user_message_count >= 0),
  assistant_message_count bigint NOT NULL CHECK (assistant_message_count >= 0),
  system_message_count bigint NOT NULL CHECK (system_message_count >= 0),
  tool_message_count bigint NOT NULL CHECK (tool_message_count >= 0),
  rollup_identity_sha256 char(64) NOT NULL CHECK (rollup_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sessionization_run_id,grain,bucket_start_utc),
  CONSTRAINT cm_archive_temporal_rollup_run_scope_fk
    FOREIGN KEY (sessionization_run_id,import_id)
    REFERENCES comind.cm_archive_sessionization_run(sessionization_run_id,import_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_temporal_rollup_identity_unique
    UNIQUE (sessionization_run_id,rollup_identity_sha256),
  CONSTRAINT cm_archive_temporal_rollup_role_counts CHECK (
    user_message_count + assistant_message_count + system_message_count + tool_message_count <= event_count
  )
);

-- Cover every A02 foreign-key access path explicitly. This avoids carrying a
-- known Supabase advisor finding into the accepted schema.
CREATE INDEX IF NOT EXISTS idx_cm_archive_sessionization_run_import
  ON comind.cm_archive_sessionization_run(import_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_sessionization_run_policy
  ON comind.cm_archive_sessionization_run(policy_key,policy_version);
CREATE INDEX IF NOT EXISTS idx_cm_archive_session_observation_run_scope_fk
  ON comind.cm_archive_session_observation(sessionization_run_id,import_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_session_event_session_fk
  ON comind.cm_archive_session_event(sessionization_run_id,session_ordinal);
CREATE INDEX IF NOT EXISTS idx_cm_archive_session_event_source_node_fk
  ON comind.cm_archive_session_event(import_id,source_conversation_id,source_node_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_session_event_time
  ON comind.cm_archive_session_event(import_id,event_at,event_ordinal);
CREATE INDEX IF NOT EXISTS idx_cm_archive_temporal_rollup_run_scope_fk
  ON comind.cm_archive_temporal_rollup(sessionization_run_id,import_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_temporal_rollup_lookup
  ON comind.cm_archive_temporal_rollup(import_id,grain,bucket_start_utc);

DROP TRIGGER IF EXISTS trg_cm_archive_session_policy_immutable ON comind.cm_archive_session_policy;
CREATE TRIGGER trg_cm_archive_session_policy_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_session_policy
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_sessionization_run_immutable ON comind.cm_archive_sessionization_run;
CREATE TRIGGER trg_cm_archive_sessionization_run_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_sessionization_run
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_session_observation_immutable ON comind.cm_archive_session_observation;
CREATE TRIGGER trg_cm_archive_session_observation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_session_observation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_session_event_immutable ON comind.cm_archive_session_event;
CREATE TRIGGER trg_cm_archive_session_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_session_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_temporal_rollup_immutable ON comind.cm_archive_temporal_rollup;
CREATE TRIGGER trg_cm_archive_temporal_rollup_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_temporal_rollup
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_sessionization_run_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_import_id uuid;
  v_source_archive_sha256 char(64);
  v_import_receipt_sha256 char(64);
  v_certification_sha256 char(64);
  v_policy_definition_sha256 char(64);
  v_gap_seconds integer;
  v_exact_boundary boolean;
  v_source_message_count bigint;
  v_source_event_count bigint;
  v_excluded_count bigint;
  v_expected_run_identity char(64);
BEGIN
  SELECT
    b.import_id,
    b.source_archive_sha256,
    i.receipt_sha256,
    b.certification_sha256,
    p.definition_sha256,
    p.inactivity_gap_seconds,
    p.exact_boundary_starts_new
  INTO
    v_import_id,
    v_source_archive_sha256,
    v_import_receipt_sha256,
    v_certification_sha256,
    v_policy_definition_sha256,
    v_gap_seconds,
    v_exact_boundary
  FROM comind.cm_conversation_history_baseline b
  JOIN comind.cm_archive_import i ON i.import_id=b.import_id
  JOIN comind.cm_archive_session_policy p
    ON p.policy_key=NEW.policy_key AND p.policy_version=NEW.policy_version
  WHERE b.baseline_id=NEW.baseline_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive sessionization requires a certified baseline and known policy';
  END IF;

  SELECT
    count(*) FILTER (WHERE source_message_id IS NOT NULL),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NOT NULL),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NULL)
  INTO v_source_message_count,v_source_event_count,v_excluded_count
  FROM comind.cm_archive_node_observation
  WHERE import_id=v_import_id;

  v_expected_run_identity := encode(extensions.digest(concat_ws('|',
    v_source_archive_sha256,
    v_import_receipt_sha256,
    v_certification_sha256,
    v_policy_definition_sha256
  ),'sha256'),'hex');

  IF NEW.import_id<>v_import_id
     OR NEW.source_archive_sha256<>v_source_archive_sha256
     OR NEW.import_receipt_sha256<>v_import_receipt_sha256
     OR NEW.certification_sha256<>v_certification_sha256
     OR NEW.policy_definition_sha256<>v_policy_definition_sha256
     OR NEW.inactivity_gap_seconds<>v_gap_seconds
     OR NEW.exact_boundary_starts_new IS DISTINCT FROM v_exact_boundary
     OR NEW.source_message_count<>v_source_message_count
     OR NEW.source_event_count<>v_source_event_count
     OR NEW.excluded_untimestamped_message_count<>v_excluded_count
     OR NEW.run_identity_sha256<>v_expected_run_identity THEN
    RAISE EXCEPTION 'Archive sessionization run does not match certified source/policy evidence';
  END IF;

  IF (v_source_event_count=0 AND NEW.result_state<>'no_timestamped_events')
     OR (v_source_event_count>0 AND NEW.result_state<>'completed') THEN
    RAISE EXCEPTION 'Archive sessionization result state does not match timestamp coverage';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_sessionization_run_guard ON comind.cm_archive_sessionization_run;
CREATE TRIGGER trg_cm_archive_sessionization_run_guard
BEFORE INSERT ON comind.cm_archive_sessionization_run
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_sessionization_run_insert();

CREATE OR REPLACE FUNCTION comind.cm_archive_session_event_projection(
  p_import_id uuid,
  p_inactivity_gap_seconds integer,
  p_exact_boundary_starts_new boolean
)
RETURNS TABLE (
  event_ordinal bigint,
  session_ordinal bigint,
  source_conversation_id text,
  source_node_id text,
  source_message_id text,
  event_at timestamptz,
  role text,
  normalized_message_hash char(64),
  gap_from_previous_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
WITH events AS (
  SELECT
    n.source_conversation_id,
    n.source_node_id,
    n.source_message_id,
    n.created_at AS event_at,
    n.role,
    n.normalized_message_hash
  FROM comind.cm_archive_node_observation n
  WHERE n.import_id=p_import_id
    AND n.source_message_id IS NOT NULL
    AND n.created_at IS NOT NULL
), ordered AS (
  SELECT
    row_number() OVER (
      ORDER BY event_at,source_conversation_id,source_node_id,source_message_id
    )::bigint AS event_ordinal,
    source_conversation_id,
    source_node_id,
    source_message_id,
    event_at,
    role,
    normalized_message_hash,
    lag(event_at) OVER (
      ORDER BY event_at,source_conversation_id,source_node_id,source_message_id
    ) AS previous_event_at
  FROM events
), marked AS (
  SELECT
    o.*,
    CASE
      WHEN previous_event_at IS NULL THEN NULL
      ELSE extract(epoch FROM (event_at-previous_event_at))::numeric
    END AS gap_from_previous_seconds,
    CASE
      WHEN previous_event_at IS NULL THEN 1
      WHEN p_exact_boundary_starts_new
        AND extract(epoch FROM (event_at-previous_event_at)) >= p_inactivity_gap_seconds THEN 1
      WHEN NOT p_exact_boundary_starts_new
        AND extract(epoch FROM (event_at-previous_event_at)) > p_inactivity_gap_seconds THEN 1
      ELSE 0
    END AS starts_new_session
  FROM ordered o
), assigned AS (
  SELECT
    m.*,
    sum(starts_new_session) OVER (
      ORDER BY event_ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )::bigint AS session_ordinal
  FROM marked m
)
SELECT
  event_ordinal,
  session_ordinal,
  source_conversation_id,
  source_node_id,
  source_message_id,
  event_at,
  role,
  normalized_message_hash,
  gap_from_previous_seconds
FROM assigned
ORDER BY event_ordinal;
$$;

CREATE OR REPLACE FUNCTION comind.cm_compute_archive_sessions(
  p_import_id uuid,
  p_policy_key text DEFAULT 'session_gap',
  p_policy_version text DEFAULT '30m-v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_baseline_id uuid;
  v_source_archive_sha256 char(64);
  v_import_receipt_sha256 char(64);
  v_certification_sha256 char(64);
  v_policy_definition_sha256 char(64);
  v_gap_seconds integer;
  v_exact_boundary boolean;
  v_source_message_count bigint;
  v_source_event_count bigint;
  v_excluded_count bigint;
  v_run_identity char(64);
  v_run_id uuid;
  v_result_state text;
BEGIN
  SELECT
    b.baseline_id,
    b.source_archive_sha256,
    i.receipt_sha256,
    b.certification_sha256,
    p.definition_sha256,
    p.inactivity_gap_seconds,
    p.exact_boundary_starts_new
  INTO
    v_baseline_id,
    v_source_archive_sha256,
    v_import_receipt_sha256,
    v_certification_sha256,
    v_policy_definition_sha256,
    v_gap_seconds,
    v_exact_boundary
  FROM comind.cm_conversation_history_baseline b
  JOIN comind.cm_archive_import i ON i.import_id=b.import_id
  JOIN comind.cm_archive_session_policy p
    ON p.policy_key=p_policy_key AND p.policy_version=p_policy_version
  WHERE b.import_id=p_import_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive sessionization requires a certified Conversation History baseline and known policy';
  END IF;

  SELECT
    count(*) FILTER (WHERE source_message_id IS NOT NULL),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NOT NULL),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NULL)
  INTO v_source_message_count,v_source_event_count,v_excluded_count
  FROM comind.cm_archive_node_observation
  WHERE import_id=p_import_id;

  v_result_state := CASE WHEN v_source_event_count=0 THEN 'no_timestamped_events' ELSE 'completed' END;
  v_run_identity := encode(extensions.digest(concat_ws('|',
    v_source_archive_sha256,
    v_import_receipt_sha256,
    v_certification_sha256,
    v_policy_definition_sha256
  ),'sha256'),'hex');

  SELECT sessionization_run_id
    INTO v_run_id
  FROM comind.cm_archive_sessionization_run
  WHERE run_identity_sha256=v_run_identity;
  IF FOUND THEN
    RETURN v_run_id;
  END IF;

  INSERT INTO comind.cm_archive_sessionization_run (
    baseline_id,import_id,source_archive_sha256,import_receipt_sha256,certification_sha256,
    policy_key,policy_version,policy_definition_sha256,inactivity_gap_seconds,
    exact_boundary_starts_new,source_message_count,source_event_count,
    excluded_untimestamped_message_count,result_state,run_identity_sha256
  ) VALUES (
    v_baseline_id,p_import_id,v_source_archive_sha256,v_import_receipt_sha256,v_certification_sha256,
    p_policy_key,p_policy_version,v_policy_definition_sha256,v_gap_seconds,
    v_exact_boundary,v_source_message_count,v_source_event_count,
    v_excluded_count,v_result_state,v_run_identity
  )
  ON CONFLICT (run_identity_sha256) DO NOTHING
  RETURNING sessionization_run_id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT sessionization_run_id INTO v_run_id
    FROM comind.cm_archive_sessionization_run
    WHERE run_identity_sha256=v_run_identity;
    RETURN v_run_id;
  END IF;

  IF v_source_event_count=0 THEN
    RETURN v_run_id;
  END IF;

  WITH projected AS (
    SELECT
      p.*,
      encode(extensions.digest(concat_ws('|',
        v_run_identity,
        p.event_ordinal::text,
        p.source_conversation_id,
        p.source_node_id,
        p.source_message_id,
        coalesce(p.normalized_message_hash,''),
        extract(epoch FROM p.event_at)::numeric::text,
        coalesce(p.role,'')
      ),'sha256'),'hex')::char(64) AS event_identity_sha256
    FROM comind.cm_archive_session_event_projection(
      p_import_id,v_gap_seconds,v_exact_boundary
    ) p
  ), session_aggregates AS (
    SELECT
      session_ordinal,
      min(event_at) AS started_at,
      max(event_at) AS ended_at,
      extract(epoch FROM (max(event_at)-min(event_at)))::numeric AS span_seconds,
      (array_agg(gap_from_previous_seconds ORDER BY event_ordinal))[1] AS opening_gap_seconds,
      count(*)::bigint AS event_count,
      count(DISTINCT source_conversation_id)::bigint AS conversation_count,
      count(*) FILTER (WHERE role='user')::bigint AS user_message_count,
      count(*) FILTER (WHERE role='assistant')::bigint AS assistant_message_count,
      count(*) FILTER (WHERE role='system')::bigint AS system_message_count,
      count(*) FILTER (WHERE role='tool')::bigint AS tool_message_count,
      (array_agg(source_conversation_id ORDER BY event_ordinal))[1] AS first_source_conversation_id,
      (array_agg(source_node_id ORDER BY event_ordinal))[1] AS first_source_node_id,
      (array_agg(source_message_id ORDER BY event_ordinal))[1] AS first_source_message_id,
      (array_agg(source_conversation_id ORDER BY event_ordinal DESC))[1] AS last_source_conversation_id,
      (array_agg(source_node_id ORDER BY event_ordinal DESC))[1] AS last_source_node_id,
      (array_agg(source_message_id ORDER BY event_ordinal DESC))[1] AS last_source_message_id,
      string_agg(event_identity_sha256,'|' ORDER BY event_ordinal) AS event_identity_sequence
    FROM projected
    GROUP BY session_ordinal
  )
  INSERT INTO comind.cm_archive_session_observation (
    sessionization_run_id,import_id,session_ordinal,session_identity_sha256,
    started_at,ended_at,span_seconds,opening_gap_seconds,event_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,
    first_source_conversation_id,first_source_node_id,first_source_message_id,
    last_source_conversation_id,last_source_node_id,last_source_message_id
  )
  SELECT
    v_run_id,p_import_id,session_ordinal,
    encode(extensions.digest(concat_ws('|',v_run_identity,session_ordinal::text,event_identity_sequence),'sha256'),'hex'),
    started_at,ended_at,span_seconds,opening_gap_seconds,event_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,
    first_source_conversation_id,first_source_node_id,first_source_message_id,
    last_source_conversation_id,last_source_node_id,last_source_message_id
  FROM session_aggregates
  ORDER BY session_ordinal;

  WITH projected AS (
    SELECT
      p.*,
      encode(extensions.digest(concat_ws('|',
        v_run_identity,
        p.event_ordinal::text,
        p.source_conversation_id,
        p.source_node_id,
        p.source_message_id,
        coalesce(p.normalized_message_hash,''),
        extract(epoch FROM p.event_at)::numeric::text,
        coalesce(p.role,'')
      ),'sha256'),'hex')::char(64) AS event_identity_sha256
    FROM comind.cm_archive_session_event_projection(
      p_import_id,v_gap_seconds,v_exact_boundary
    ) p
  )
  INSERT INTO comind.cm_archive_session_event (
    sessionization_run_id,import_id,session_ordinal,event_ordinal,
    source_conversation_id,source_node_id,source_message_id,event_at,role,
    gap_from_previous_seconds,event_identity_sha256
  )
  SELECT
    v_run_id,p_import_id,session_ordinal,event_ordinal,
    source_conversation_id,source_node_id,source_message_id,event_at,role,
    gap_from_previous_seconds,event_identity_sha256
  FROM projected
  ORDER BY event_ordinal;

  WITH buckets AS (
    SELECT
      'hour_utc'::text AS grain,
      (date_trunc('hour',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS bucket_start_utc,
      session_ordinal,source_conversation_id,role
    FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT
      'day_utc',
      (date_trunc('day',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      session_ordinal,source_conversation_id,role
    FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT
      'month_utc',
      (date_trunc('month',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      session_ordinal,source_conversation_id,role
    FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT
      'year_utc',
      (date_trunc('year',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
      session_ordinal,source_conversation_id,role
    FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
  ), aggregates AS (
    SELECT
      grain,bucket_start_utc,
      count(*)::bigint AS event_count,
      count(DISTINCT session_ordinal)::bigint AS session_count,
      count(DISTINCT source_conversation_id)::bigint AS conversation_count,
      count(*) FILTER (WHERE role='user')::bigint AS user_message_count,
      count(*) FILTER (WHERE role='assistant')::bigint AS assistant_message_count,
      count(*) FILTER (WHERE role='system')::bigint AS system_message_count,
      count(*) FILTER (WHERE role='tool')::bigint AS tool_message_count
    FROM buckets
    GROUP BY grain,bucket_start_utc
  )
  INSERT INTO comind.cm_archive_temporal_rollup (
    sessionization_run_id,import_id,grain,bucket_start_utc,
    event_count,session_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,
    rollup_identity_sha256
  )
  SELECT
    v_run_id,p_import_id,grain,bucket_start_utc,
    event_count,session_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,
    encode(extensions.digest(concat_ws('|',
      v_run_identity,
      grain,
      extract(epoch FROM bucket_start_utc)::numeric::text,
      event_count::text,session_count::text,conversation_count::text,
      user_message_count::text,assistant_message_count::text,
      system_message_count::text,tool_message_count::text
    ),'sha256'),'hex')
  FROM aggregates
  ORDER BY grain,bucket_start_utc;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_archive_local_hour_distribution(
  p_sessionization_run_id uuid,
  p_timezone text
)
RETURNS TABLE (
  timezone_name text,
  local_hour integer,
  event_count bigint,
  session_count bigint,
  conversation_count bigint,
  user_message_count bigint,
  assistant_message_count bigint,
  system_message_count bigint,
  tool_message_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'Unknown IANA timezone: %',p_timezone;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_archive_sessionization_run
    WHERE sessionization_run_id=p_sessionization_run_id
  ) THEN
    RAISE EXCEPTION 'Archive sessionization run does not exist';
  END IF;

  RETURN QUERY
  SELECT
    p_timezone,
    extract(hour FROM e.event_at AT TIME ZONE p_timezone)::integer AS local_hour,
    count(*)::bigint,
    count(DISTINCT e.session_ordinal)::bigint,
    count(DISTINCT e.source_conversation_id)::bigint,
    count(*) FILTER (WHERE e.role='user')::bigint,
    count(*) FILTER (WHERE e.role='assistant')::bigint,
    count(*) FILTER (WHERE e.role='system')::bigint,
    count(*) FILTER (WHERE e.role='tool')::bigint
  FROM comind.cm_archive_session_event e
  WHERE e.sessionization_run_id=p_sessionization_run_id
  GROUP BY extract(hour FROM e.event_at AT TIME ZONE p_timezone)
  ORDER BY local_hour;
END;
$$;

ALTER TABLE comind.cm_archive_session_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_session_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_sessionization_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_sessionization_run FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_session_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_session_observation FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_session_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_session_event FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_temporal_rollup ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_temporal_rollup FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_session_policy;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_session_policy
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_session_policy;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_session_policy
FOR SELECT TO comind_conversation_history_reader USING (true);

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_sessionization_run;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_sessionization_run
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_sessionization_run;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_sessionization_run
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_sessionization_run.import_id
));

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_session_observation;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_session_observation
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_session_observation;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_session_observation
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_session_observation.import_id
));

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_session_event;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_session_event
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_session_event;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_session_event
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_session_event.import_id
));

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_temporal_rollup;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_temporal_rollup
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_temporal_rollup;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_temporal_rollup
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_temporal_rollup.import_id
));

REVOKE ALL ON TABLE
  comind.cm_archive_session_policy,
  comind.cm_archive_sessionization_run,
  comind.cm_archive_session_observation,
  comind.cm_archive_session_event,
  comind.cm_archive_temporal_rollup
FROM PUBLIC;

DO $$
DECLARE v_role text;
DECLARE v_table text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'anon','authenticated','service_role','comind_archive_ingestor',
    'comind_conversation_reconciler','comind_conversation_deriver',
    'comind_conversation_history_certifier'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      FOREACH v_table IN ARRAY ARRAY[
        'cm_archive_session_policy','cm_archive_sessionization_run',
        'cm_archive_session_observation','cm_archive_session_event',
        'cm_archive_temporal_rollup'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM %I',v_table,v_role);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

GRANT SELECT ON TABLE
  comind.cm_archive_session_policy,
  comind.cm_archive_sessionization_run,
  comind.cm_archive_session_observation,
  comind.cm_archive_session_event,
  comind.cm_archive_temporal_rollup
TO comind_conversation_history_deriver,comind_conversation_history_reader;

REVOKE ALL ON FUNCTION comind.cm_guard_archive_sessionization_run_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_archive_session_event_projection(uuid,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_compute_archive_sessions(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION comind.cm_compute_archive_sessions(uuid,text,text)
  TO comind_conversation_history_deriver;
GRANT EXECUTE ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text)
  TO comind_conversation_history_deriver,comind_conversation_history_reader;

COMMENT ON TABLE comind.cm_archive_session_policy IS
  'CHIST-A02 immutable versioned sessionization policies. Inactivity thresholds are analytical conventions, not psychological or productivity claims.';
COMMENT ON TABLE comind.cm_archive_sessionization_run IS
  'CHIST-A02 immutable import-wide sessionization run over one certified Conversation History baseline and one explicit session policy.';
COMMENT ON TABLE comind.cm_archive_session_observation IS
  'CHIST-A02 immutable deterministic session observations derived across conversations from timestamped source messages.';
COMMENT ON TABLE comind.cm_archive_session_event IS
  'CHIST-A02 event-by-event session membership preserving source conversation/node/message lineage and deterministic cross-conversation ordering.';
COMMENT ON TABLE comind.cm_archive_temporal_rollup IS
  'CHIST-A02 immutable UTC temporal rollups derived from a sessionization run.';
COMMENT ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text) IS
  'CHIST-A02 read projection of event distribution by local clock hour for an explicit IANA timezone. Repeated DST clock hours are intentionally combined because this is an hour-of-day distribution, not durable source evidence.';

COMMIT;
