-- CE-004 Friction and Failure Register workflows.
-- Additive Test-first lifecycle over existing immutable CE signals.
-- Production activation is not implied by this migration.

CREATE TABLE IF NOT EXISTS comind.cm_ce_signal_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES comind.cm_ce_signal(signal_id) ON DELETE RESTRICT,
  actor_id uuid NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  owner_actor_id uuid NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'triaged',
    'diagnosed',
    'deferred',
    'resolved',
    'closed_no_action',
    'reopened'
  )),
  recurrence_risk text NOT NULL CHECK (recurrence_risk IN ('unknown','low','moderate','high','critical')),
  pattern_key text NULL CHECK (
    pattern_key IS NULL OR (
      length(btrim(pattern_key)) > 0
      AND length(pattern_key) <= 256
      AND pattern_key = btrim(pattern_key)
    )
  ),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0 AND summary=btrim(summary)),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'),
  source_system text NOT NULL CHECK (length(btrim(source_system)) > 0 AND source_system=btrim(source_system)),
  source_ref text NULL CHECK (source_ref IS NULL OR (length(btrim(source_ref)) > 0 AND source_ref=btrim(source_ref))),
  idempotency_key text NULL CHECK (
    idempotency_key IS NULL OR (
      length(btrim(idempotency_key)) > 0
      AND length(idempotency_key) <= 512
      AND idempotency_key=btrim(idempotency_key)
    )
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_ce_signal_event_idempotency_uq
  ON comind.cm_ce_signal_event(signal_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_signal_event_latest_idx
  ON comind.cm_ce_signal_event(signal_id,created_at DESC,event_id DESC);
CREATE INDEX IF NOT EXISTS cm_ce_signal_event_pattern_idx
  ON comind.cm_ce_signal_event(pattern_key,created_at DESC)
  WHERE pattern_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_signal_event_owner_idx
  ON comind.cm_ce_signal_event(owner_actor_id,created_at DESC)
  WHERE owner_actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS cm_ce_signal_event_immutable ON comind.cm_ce_signal_event;
CREATE TRIGGER cm_ce_signal_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_signal_event
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE OR REPLACE FUNCTION comind.record_ce_signal_event(
  p_signal_id uuid,
  p_actor_id uuid,
  p_owner_actor_id uuid,
  p_event_type text,
  p_recurrence_risk text,
  p_pattern_key text,
  p_summary text,
  p_details jsonb,
  p_source_system text,
  p_source_ref text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_signal_type text;
  v_current_state text;
  v_existing comind.cm_ce_signal_event%ROWTYPE;
  v_event_id uuid;
  v_details jsonb := COALESCE(p_details,'{}'::jsonb);
BEGIN
  IF p_signal_id IS NULL THEN
    RAISE EXCEPTION 'CE-004 signal id is required' USING ERRCODE='check_violation';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('triaged','diagnosed','deferred','resolved','closed_no_action','reopened') THEN
    RAISE EXCEPTION 'Invalid CE-004 event type' USING ERRCODE='check_violation';
  END IF;
  IF p_recurrence_risk IS NULL OR p_recurrence_risk NOT IN ('unknown','low','moderate','high','critical') THEN
    RAISE EXCEPTION 'CE-004 recurrence risk is required and must be valid' USING ERRCODE='check_violation';
  END IF;
  IF p_pattern_key IS NOT NULL AND (p_pattern_key<>btrim(p_pattern_key) OR length(p_pattern_key)=0 OR length(p_pattern_key)>256) THEN
    RAISE EXCEPTION 'Invalid CE-004 pattern key' USING ERRCODE='check_violation';
  END IF;
  IF p_summary IS NULL OR length(btrim(p_summary))=0 OR p_summary<>btrim(p_summary) THEN
    RAISE EXCEPTION 'CE-004 event summary is required and must be trimmed' USING ERRCODE='check_violation';
  END IF;
  IF jsonb_typeof(v_details) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'CE-004 event details must be a JSON object' USING ERRCODE='check_violation';
  END IF;
  IF p_source_system IS NULL OR length(btrim(p_source_system))=0 OR p_source_system<>btrim(p_source_system) THEN
    RAISE EXCEPTION 'CE-004 source system is required and must be trimmed' USING ERRCODE='check_violation';
  END IF;
  IF p_source_ref IS NOT NULL AND (length(btrim(p_source_ref))=0 OR p_source_ref<>btrim(p_source_ref)) THEN
    RAISE EXCEPTION 'Invalid CE-004 source reference' USING ERRCODE='check_violation';
  END IF;
  IF p_idempotency_key IS NOT NULL AND (
    length(btrim(p_idempotency_key))=0 OR p_idempotency_key<>btrim(p_idempotency_key) OR length(p_idempotency_key)>512
  ) THEN
    RAISE EXCEPTION 'Invalid CE-004 idempotency key' USING ERRCODE='check_violation';
  END IF;
  IF p_event_type IN ('resolved','closed_no_action') AND p_source_ref IS NULL THEN
    RAISE EXCEPTION 'CE-004 terminal event requires source_ref provenance' USING ERRCODE='check_violation';
  END IF;
  IF p_event_type='closed_no_action' AND NOT (v_details ? 'disposition_reason') THEN
    RAISE EXCEPTION 'CE-004 closed_no_action requires details.disposition_reason' USING ERRCODE='check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_signal_id::text,0));

  SELECT signal_type INTO v_signal_type
  FROM comind.cm_ce_signal
  WHERE signal_id=p_signal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CE-004 signal does not exist' USING ERRCODE='check_violation';
  END IF;
  IF v_signal_type NOT IN ('friction','failure') THEN
    RAISE EXCEPTION 'CE-004 lifecycle accepts friction or failure signals only' USING ERRCODE='check_violation';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM comind.cm_ce_signal_event
    WHERE signal_id=p_signal_id AND idempotency_key=p_idempotency_key;
    IF FOUND THEN
      IF v_existing.actor_id IS NOT DISTINCT FROM p_actor_id
         AND v_existing.owner_actor_id IS NOT DISTINCT FROM p_owner_actor_id
         AND v_existing.event_type=p_event_type
         AND v_existing.recurrence_risk=p_recurrence_risk
         AND v_existing.pattern_key IS NOT DISTINCT FROM p_pattern_key
         AND v_existing.summary=p_summary
         AND v_existing.details=v_details
         AND v_existing.source_system=p_source_system
         AND v_existing.source_ref IS NOT DISTINCT FROM p_source_ref THEN
        RETURN v_existing.event_id;
      END IF;
      RAISE EXCEPTION 'CE-004 idempotency key replay conflicts with existing event'
        USING ERRCODE='unique_violation';
    END IF;
  END IF;

  SELECT event_type INTO v_current_state
  FROM comind.cm_ce_signal_event
  WHERE signal_id=p_signal_id
  ORDER BY created_at DESC,event_id DESC
  LIMIT 1;
  v_current_state := COALESCE(v_current_state,'untriaged');

  IF v_current_state='untriaged' AND p_event_type<>'triaged' THEN
    RAISE EXCEPTION 'CE-004 first lifecycle event must be triaged' USING ERRCODE='check_violation';
  ELSIF v_current_state='triaged' AND p_event_type NOT IN ('diagnosed','deferred','resolved','closed_no_action') THEN
    RAISE EXCEPTION 'Invalid CE-004 transition from triaged to %',p_event_type USING ERRCODE='check_violation';
  ELSIF v_current_state='diagnosed' AND p_event_type NOT IN ('deferred','resolved','closed_no_action') THEN
    RAISE EXCEPTION 'Invalid CE-004 transition from diagnosed to %',p_event_type USING ERRCODE='check_violation';
  ELSIF v_current_state='deferred' AND p_event_type NOT IN ('triaged','diagnosed','resolved','closed_no_action') THEN
    RAISE EXCEPTION 'Invalid CE-004 transition from deferred to %',p_event_type USING ERRCODE='check_violation';
  ELSIF v_current_state IN ('resolved','closed_no_action') AND p_event_type<>'reopened' THEN
    RAISE EXCEPTION 'CE-004 terminal signal requires explicit reopened transition' USING ERRCODE='check_violation';
  ELSIF v_current_state='reopened' AND p_event_type NOT IN ('triaged','diagnosed','deferred','resolved','closed_no_action') THEN
    RAISE EXCEPTION 'Invalid CE-004 transition from reopened to %',p_event_type USING ERRCODE='check_violation';
  END IF;

  INSERT INTO comind.cm_ce_signal_event(
    signal_id,actor_id,owner_actor_id,event_type,recurrence_risk,pattern_key,
    summary,details,source_system,source_ref,idempotency_key
  ) VALUES (
    p_signal_id,p_actor_id,p_owner_actor_id,p_event_type,p_recurrence_risk,p_pattern_key,
    p_summary,v_details,p_source_system,p_source_ref,p_idempotency_key
  ) RETURNING event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE VIEW comind.v_ce_friction_failure_register
WITH (security_invoker = true)
AS
WITH current_signal AS (
  SELECT
    s.signal_id,
    s.project_id,
    s.task_id,
    s.actor_id,
    s.signal_type,
    s.severity,
    s.requires_action,
    s.summary,
    s.details,
    s.source_system AS signal_source_system,
    s.source_ref AS signal_source_ref,
    s.idempotency_key,
    s.observed_at,
    s.created_at AS signal_created_at,
    COALESCE(latest.event_type,'untriaged') AS current_state,
    latest.event_id AS latest_event_id,
    latest.summary AS latest_event_summary,
    latest.source_system AS latest_event_source_system,
    latest.source_ref AS latest_event_source_ref,
    latest.created_at AS latest_event_at,
    latest.owner_actor_id,
    latest.recurrence_risk,
    latest.pattern_key,
    COALESCE(linked.improvement_count,0::bigint) AS linked_improvement_count
  FROM comind.cm_ce_signal s
  LEFT JOIN LATERAL (
    SELECT e.*
    FROM comind.cm_ce_signal_event e
    WHERE e.signal_id=s.signal_id
    ORDER BY e.created_at DESC,e.event_id DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS improvement_count
    FROM comind.cm_ce_improvement_signal rel
    WHERE rel.signal_id=s.signal_id
  ) linked ON true
  WHERE s.signal_type IN ('friction','failure')
), pattern_stats AS (
  SELECT
    c.*,
    CASE
      WHEN c.pattern_key IS NULL THEN 0::bigint
      ELSE count(*) OVER (PARTITION BY c.pattern_key)::bigint
    END AS pattern_occurrence_count,
    CASE
      WHEN c.pattern_key IS NULL THEN c.linked_improvement_count
      ELSE sum(c.linked_improvement_count) OVER (PARTITION BY c.pattern_key)::bigint
    END AS pattern_linked_improvement_count
  FROM current_signal c
)
SELECT
  p.*,
  (p.requires_action AND p.current_state NOT IN ('resolved','closed_no_action')) AS open_action,
  (
    p.requires_action
    AND p.current_state NOT IN ('resolved','closed_no_action')
    AND p.pattern_key IS NOT NULL
    AND p.pattern_occurrence_count >= 2
    AND p.pattern_linked_improvement_count = 0
    AND (
      p.severity IN ('moderate','high','critical')
      OR p.recurrence_risk IN ('moderate','high','critical')
    )
  ) AS improvement_review_recommended
FROM pattern_stats p;

ALTER TABLE comind.cm_ce_signal_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_signal_event FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_ce_signal_event_service_select ON comind.cm_ce_signal_event;
CREATE POLICY cm_ce_signal_event_service_select
ON comind.cm_ce_signal_event
FOR SELECT
TO service_role
USING (true);

REVOKE ALL ON TABLE comind.cm_ce_signal_event FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON comind.v_ce_friction_failure_register FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION comind.record_ce_signal_event(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;

GRANT USAGE ON SCHEMA comind TO service_role;
GRANT SELECT ON TABLE comind.cm_ce_signal_event TO service_role;
GRANT SELECT ON comind.v_ce_friction_failure_register TO service_role;
GRANT EXECUTE ON FUNCTION comind.record_ce_signal_event(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text) TO service_role;

COMMENT ON TABLE comind.cm_ce_signal_event IS
  'CE-004 append-only triage, diagnosis and disposition lifecycle for existing friction/failure signals. Original signal observations remain immutable.';
COMMENT ON VIEW comind.v_ce_friction_failure_register IS
  'CE-004 deterministic current register. Recurrence exists only through explicit current pattern_key values; prose similarity is never inferred.';
COMMENT ON FUNCTION comind.record_ce_signal_event(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text) IS
  'CE-004 constrained lifecycle writer with serialized transition validation, terminal provenance requirements and idempotent replay.';
