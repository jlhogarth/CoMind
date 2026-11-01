BEGIN;

CREATE TABLE IF NOT EXISTS comind_pm.pm_lane_conversation_title_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES comind_pm.pm_work_items(id) ON DELETE RESTRICT,
  binding_event_id uuid NOT NULL REFERENCES comind_pm.pm_lane_conversation_binding_events(id) ON DELETE RESTRICT,
  execution_surface text NOT NULL CHECK (execution_surface IN ('chatgpt')),
  external_conversation_id text NOT NULL,
  registered_conversation_url text NOT NULL,
  observed_title text NOT NULL CHECK (length(btrim(observed_title)) > 0 AND length(observed_title) <= 500),
  observation_method text NOT NULL CHECK (observation_method IN (
    'binding_bootstrap',
    'cbe_observed',
    'runtime_observed',
    'archive_observed',
    'manual_observed'
  )),
  identity_evidence_ref text NOT NULL CHECK (length(btrim(identity_evidence_ref)) > 0),
  observed_by text NOT NULL CHECK (length(btrim(observed_by)) > 0),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (work_item_id, idempotency_key),
  CHECK (external_conversation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CHECK (registered_conversation_url = 'https://chatgpt.com/c/' || external_conversation_id)
);

CREATE INDEX IF NOT EXISTS pm_lane_conversation_title_work_item_idx
  ON comind_pm.pm_lane_conversation_title_events(work_item_id, observed_at DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pm_lane_conversation_title_external_idx
  ON comind_pm.pm_lane_conversation_title_events(execution_surface, external_conversation_id, observed_at DESC);

ALTER TABLE comind_pm.pm_lane_conversation_title_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_deny_all ON comind_pm.pm_lane_conversation_title_events;
CREATE POLICY private_deny_all ON comind_pm.pm_lane_conversation_title_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_title_events FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_title_events FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_title_events FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_title_events FROM service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION comind_pm.reject_lane_conversation_title_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind_pm
AS $$
BEGIN
  RAISE EXCEPTION 'Lane conversation title events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_lane_conversation_title_events_append_only
  ON comind_pm.pm_lane_conversation_title_events;
CREATE TRIGGER trg_lane_conversation_title_events_append_only
BEFORE UPDATE OR DELETE ON comind_pm.pm_lane_conversation_title_events
FOR EACH ROW EXECUTE FUNCTION comind_pm.reject_lane_conversation_title_event_mutation();

INSERT INTO comind_pm.pm_lane_conversation_title_events(
  work_item_id,
  binding_event_id,
  execution_surface,
  external_conversation_id,
  registered_conversation_url,
  observed_title,
  observation_method,
  identity_evidence_ref,
  observed_by,
  idempotency_key,
  observed_at,
  metadata
)
SELECT
  e.work_item_id,
  e.id,
  e.execution_surface,
  e.external_conversation_id,
  e.registered_conversation_url,
  e.observed_title,
  'binding_bootstrap',
  e.identity_evidence_ref,
  e.registered_by,
  'binding-bootstrap:' || e.id::text,
  e.created_at,
  jsonb_build_object('sourceBindingEventId', e.id, 'migration', 'L4A-MP-008')
FROM comind_pm.pm_lane_conversation_binding_events e
WHERE e.event_type = 'bound'
  AND e.observed_title IS NOT NULL
  AND length(btrim(e.observed_title)) > 0
ON CONFLICT (work_item_id, idempotency_key) DO NOTHING;

CREATE OR REPLACE FUNCTION comind_pm.observe_lane_conversation_title(
  p_work_key text,
  p_external_conversation_id text,
  p_registered_conversation_url text,
  p_observed_title text,
  p_observation_method text,
  p_identity_evidence_ref text,
  p_observed_by text,
  p_idempotency_key text,
  p_observed_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_work_item_id uuid;
  v_binding comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_existing comind_pm.pm_lane_conversation_title_events%ROWTYPE;
  v_latest comind_pm.pm_lane_conversation_title_events%ROWTYPE;
  v_new comind_pm.pm_lane_conversation_title_events%ROWTYPE;
  v_conversation_id text;
  v_url text;
  v_title text;
  v_observed_at timestamptz;
BEGIN
  IF p_work_key IS NULL OR length(btrim(p_work_key)) = 0 THEN
    RAISE EXCEPTION 'WORK_KEY_REQUIRED';
  END IF;
  IF p_external_conversation_id IS NULL OR length(btrim(p_external_conversation_id)) = 0 THEN
    RAISE EXCEPTION 'EXTERNAL_CONVERSATION_ID_REQUIRED';
  END IF;
  v_conversation_id := lower(btrim(p_external_conversation_id));
  IF v_conversation_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'INVALID_CHATGPT_CONVERSATION_ID:%', v_conversation_id;
  END IF;
  v_url := btrim(coalesce(p_registered_conversation_url, ''));
  IF v_url <> 'https://chatgpt.com/c/' || v_conversation_id THEN
    RAISE EXCEPTION 'CHATGPT_CONVERSATION_URL_ID_MISMATCH';
  END IF;
  v_title := btrim(coalesce(p_observed_title, ''));
  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'OBSERVED_TITLE_REQUIRED';
  END IF;
  IF length(v_title) > 500 THEN
    RAISE EXCEPTION 'OBSERVED_TITLE_TOO_LONG';
  END IF;
  IF p_observation_method NOT IN ('cbe_observed','runtime_observed','archive_observed','manual_observed') THEN
    RAISE EXCEPTION 'INVALID_TITLE_OBSERVATION_METHOD:%', p_observation_method;
  END IF;
  IF p_identity_evidence_ref IS NULL OR length(btrim(p_identity_evidence_ref)) = 0 THEN
    RAISE EXCEPTION 'IDENTITY_EVIDENCE_REF_REQUIRED';
  END IF;
  IF p_observed_by IS NULL OR length(btrim(p_observed_by)) = 0 THEN
    RAISE EXCEPTION 'OBSERVED_BY_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_METADATA_MUST_BE_OBJECT';
  END IF;
  v_observed_at := coalesce(p_observed_at, clock_timestamp());

  SELECT id INTO v_work_item_id
  FROM comind_pm.pm_work_items
  WHERE work_key = btrim(p_work_key);
  IF v_work_item_id IS NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND:%', btrim(p_work_key);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lane-conversation:' || btrim(p_work_key), 0));

  SELECT * INTO v_binding
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_MISSING:%', btrim(p_work_key);
  END IF;
  IF v_binding.event_type <> 'bound' THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_INACTIVE:%', btrim(p_work_key);
  END IF;
  IF v_binding.external_conversation_id <> v_conversation_id
     OR v_binding.registered_conversation_url <> v_url THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_CONFLICT:%', btrim(p_work_key);
  END IF;

  SELECT * INTO v_existing
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id
    AND idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.external_conversation_id <> v_conversation_id
       OR v_existing.registered_conversation_url <> v_url
       OR v_existing.observed_title <> v_title THEN
      RAISE EXCEPTION 'LANE_CONVERSATION_TITLE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'observed',
      'workKey', btrim(p_work_key),
      'titleEventId', v_existing.id,
      'currentTitle', v_existing.observed_title,
      'created', false,
      'replayed', true,
      'observedAt', v_existing.observed_at
    );
  END IF;

  SELECT * INTO v_latest
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id
    AND external_conversation_id = v_conversation_id
    AND registered_conversation_url = v_url
  ORDER BY observed_at DESC, created_at DESC, id DESC
  LIMIT 1;

  IF FOUND AND v_latest.observed_title = v_title AND v_observed_at >= v_latest.observed_at THEN
    RETURN jsonb_build_object(
      'status', 'observed',
      'workKey', btrim(p_work_key),
      'titleEventId', v_latest.id,
      'currentTitle', v_latest.observed_title,
      'created', false,
      'replayed', true,
      'semanticDuplicate', true,
      'observedAt', v_latest.observed_at
    );
  END IF;

  INSERT INTO comind_pm.pm_lane_conversation_title_events(
    work_item_id,
    binding_event_id,
    execution_surface,
    external_conversation_id,
    registered_conversation_url,
    observed_title,
    observation_method,
    identity_evidence_ref,
    observed_by,
    idempotency_key,
    observed_at,
    metadata
  ) VALUES (
    v_work_item_id,
    v_binding.id,
    v_binding.execution_surface,
    v_conversation_id,
    v_url,
    v_title,
    p_observation_method,
    btrim(p_identity_evidence_ref),
    btrim(p_observed_by),
    btrim(p_idempotency_key),
    v_observed_at,
    p_metadata
  ) RETURNING * INTO v_new;

  SELECT * INTO v_latest
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id
    AND external_conversation_id = v_conversation_id
    AND registered_conversation_url = v_url
  ORDER BY observed_at DESC, created_at DESC, id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', 'observed',
    'workKey', btrim(p_work_key),
    'titleEventId', v_new.id,
    'observedTitle', v_new.observed_title,
    'currentTitle', v_latest.observed_title,
    'currentTitleEventId', v_latest.id,
    'isCurrent', v_latest.id = v_new.id,
    'created', true,
    'replayed', false,
    'observedAt', v_new.observed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.register_or_observe_lane_conversation(
  p_work_key text,
  p_external_conversation_id text,
  p_registered_conversation_url text,
  p_observed_title text,
  p_registration_method text,
  p_identity_evidence_ref text,
  p_observed_by text,
  p_idempotency_key text,
  p_observed_at timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_resolved jsonb;
  v_binding jsonb;
  v_title jsonb := NULL;
  v_conversation_id text;
  v_url text;
  v_observation_method text;
BEGIN
  IF p_external_conversation_id IS NULL OR length(btrim(p_external_conversation_id)) = 0 THEN
    RAISE EXCEPTION 'EXTERNAL_CONVERSATION_ID_REQUIRED';
  END IF;
  IF p_registered_conversation_url IS NULL OR length(btrim(p_registered_conversation_url)) = 0 THEN
    RAISE EXCEPTION 'REGISTERED_CONVERSATION_URL_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  v_conversation_id := lower(btrim(p_external_conversation_id));
  v_url := btrim(p_registered_conversation_url);

  v_resolved := comind_pm.resolve_lane_conversation_binding(p_work_key);
  IF v_resolved->>'status' = 'work_item_missing' THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND:%', btrim(p_work_key);
  ELSIF v_resolved->>'status' = 'conversation_binding_inactive' THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_INACTIVE:%', btrim(p_work_key);
  ELSIF v_resolved->>'status' = 'conversation_binding_missing' THEN
    v_binding := comind_pm.bind_lane_conversation(
      p_work_key,
      v_conversation_id,
      v_url,
      nullif(btrim(coalesce(p_observed_title, '')), ''),
      p_registration_method,
      p_identity_evidence_ref,
      p_observed_by,
      btrim(p_idempotency_key) || ':binding',
      false,
      p_metadata || jsonb_build_object('autoRegistration', true)
    );
  ELSIF v_resolved->>'status' = 'active' THEN
    IF v_resolved->>'externalConversationId' <> v_conversation_id
       OR v_resolved->>'registeredConversationUrl' <> v_url THEN
      RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_CONFLICT:%', btrim(p_work_key);
    END IF;
    v_binding := jsonb_build_object(
      'status', 'active',
      'workKey', btrim(p_work_key),
      'bindingEventId', v_resolved->>'bindingEventId',
      'externalConversationId', v_conversation_id,
      'registeredConversationUrl', v_url,
      'created', false,
      'replayed', true
    );
  ELSE
    RAISE EXCEPTION 'UNEXPECTED_LANE_CONVERSATION_RESOLUTION:%', coalesce(v_resolved->>'status','null');
  END IF;

  IF p_observed_title IS NOT NULL AND length(btrim(p_observed_title)) > 0 THEN
    v_observation_method := CASE p_registration_method
      WHEN 'cbe_observed' THEN 'cbe_observed'
      WHEN 'chatgpt_archive_exact_id' THEN 'archive_observed'
      WHEN 'manual_exact_url' THEN 'manual_observed'
      ELSE 'runtime_observed'
    END;
    v_title := comind_pm.observe_lane_conversation_title(
      p_work_key,
      v_conversation_id,
      v_url,
      p_observed_title,
      v_observation_method,
      p_identity_evidence_ref,
      p_observed_by,
      btrim(p_idempotency_key) || ':title',
      p_observed_at,
      p_metadata || jsonb_build_object('autoRegistration', true)
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'active',
    'workKey', btrim(p_work_key),
    'binding', v_binding,
    'titleObservation', v_title
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.lane_conversation_title_history(p_work_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_work_item_id uuid;
  v_history jsonb;
BEGIN
  IF p_work_key IS NULL OR length(btrim(p_work_key)) = 0 THEN
    RAISE EXCEPTION 'WORK_KEY_REQUIRED';
  END IF;
  SELECT id INTO v_work_item_id FROM comind_pm.pm_work_items WHERE work_key = btrim(p_work_key);
  IF v_work_item_id IS NULL THEN
    RETURN jsonb_build_object('status','work_item_missing','workKey',btrim(p_work_key),'history','[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'titleEventId', id,
    'bindingEventId', binding_event_id,
    'externalConversationId', external_conversation_id,
    'registeredConversationUrl', registered_conversation_url,
    'observedTitle', observed_title,
    'observationMethod', observation_method,
    'identityEvidenceRef', identity_evidence_ref,
    'observedBy', observed_by,
    'observedAt', observed_at,
    'createdAt', created_at
  ) ORDER BY observed_at ASC, created_at ASC, id ASC), '[]'::jsonb)
  INTO v_history
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id;

  RETURN jsonb_build_object('status','ok','workKey',btrim(p_work_key),'history',v_history,'count',jsonb_array_length(v_history));
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.resolve_lane_conversation_binding(p_work_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_work_item_id uuid;
  v_event comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_title comind_pm.pm_lane_conversation_title_events%ROWTYPE;
  v_title_count bigint := 0;
BEGIN
  IF p_work_key IS NULL OR length(btrim(p_work_key)) = 0 THEN
    RAISE EXCEPTION 'WORK_KEY_REQUIRED';
  END IF;

  SELECT id INTO v_work_item_id
  FROM comind_pm.pm_work_items
  WHERE work_key = btrim(p_work_key);

  IF v_work_item_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'work_item_missing',
      'workKey', btrim(p_work_key),
      'reason', 'work_item_missing',
      'why', 'No canonical PM work item exists for this work key.'
    );
  END IF;

  SELECT * INTO v_event
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'conversation_binding_missing',
      'workKey', btrim(p_work_key),
      'reason', 'conversation_binding_missing',
      'why', 'No canonical originating-conversation binding exists for this lane.'
    );
  END IF;

  SELECT count(*) INTO v_title_count
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id
    AND external_conversation_id = v_event.external_conversation_id
    AND registered_conversation_url = v_event.registered_conversation_url;

  SELECT * INTO v_title
  FROM comind_pm.pm_lane_conversation_title_events
  WHERE work_item_id = v_work_item_id
    AND external_conversation_id = v_event.external_conversation_id
    AND registered_conversation_url = v_event.registered_conversation_url
  ORDER BY observed_at DESC, created_at DESC, id DESC
  LIMIT 1;

  IF v_event.event_type = 'retired' THEN
    RETURN jsonb_build_object(
      'status', 'conversation_binding_inactive',
      'workKey', btrim(p_work_key),
      'reason', 'conversation_binding_inactive',
      'why', 'The latest canonical originating-conversation binding for this lane has been retired.',
      'bindingEventId', v_event.id,
      'executionSurface', v_event.execution_surface,
      'externalConversationId', v_event.external_conversation_id,
      'registeredConversationUrl', v_event.registered_conversation_url,
      'observedTitle', v_event.observed_title,
      'currentTitle', coalesce(v_title.observed_title, v_event.observed_title),
      'currentTitleEventId', v_title.id,
      'currentTitleObservedAt', v_title.observed_at,
      'titleHistoryCount', v_title_count,
      'identityEvidenceRef', v_event.identity_evidence_ref,
      'registeredBy', v_event.registered_by,
      'createdAt', v_event.created_at
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'active',
    'workKey', btrim(p_work_key),
    'reason', 'conversation_binding_active',
    'bindingEventId', v_event.id,
    'executionSurface', v_event.execution_surface,
    'externalConversationId', v_event.external_conversation_id,
    'registeredConversationUrl', v_event.registered_conversation_url,
    'observedTitle', v_event.observed_title,
    'currentTitle', coalesce(v_title.observed_title, v_event.observed_title),
    'currentTitleEventId', v_title.id,
    'currentTitleObservedAt', v_title.observed_at,
    'titleHistoryCount', v_title_count,
    'registrationMethod', v_event.registration_method,
    'identityEvidenceRef', v_event.identity_evidence_ref,
    'registeredBy', v_event.registered_by,
    'createdAt', v_event.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION comind_pm.observe_lane_conversation_title(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.register_or_observe_lane_conversation(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.lane_conversation_title_history(text) FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.observe_lane_conversation_title(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.register_or_observe_lane_conversation(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.lane_conversation_title_history(text) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.observe_lane_conversation_title(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.register_or_observe_lane_conversation(text,text,text,text,text,text,text,text,timestamptz,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.lane_conversation_title_history(text) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION comind_pm.observe_lane_conversation_title(text,text,text,text,text,text,text,text,timestamptz,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.register_or_observe_lane_conversation(text,text,text,text,text,text,text,text,timestamptz,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.lane_conversation_title_history(text) TO service_role;
  END IF;
END $$;

COMMENT ON TABLE comind_pm.pm_lane_conversation_title_events IS
  'Append-only observed title/name history for exact canonical lane conversation identities. Titles are mutable metadata and never identity authority.';
COMMENT ON FUNCTION comind_pm.register_or_observe_lane_conversation(text,text,text,text,text,text,text,text,timestamptz,jsonb) IS
  'Trusted runtime registration adapter: exact conversation UUID/URL may establish a missing binding and append title observations; title alone can never bind or rebind a lane.';

COMMIT;
