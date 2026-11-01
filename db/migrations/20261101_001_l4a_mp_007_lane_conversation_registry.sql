BEGIN;

CREATE TABLE IF NOT EXISTS comind_pm.pm_lane_conversation_binding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES comind_pm.pm_work_items(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('bound','retired')),
  execution_surface text NOT NULL CHECK (execution_surface IN ('chatgpt')),
  external_conversation_id text NOT NULL,
  registered_conversation_url text NOT NULL,
  observed_title text,
  registration_method text NOT NULL CHECK (registration_method IN (
    'cbe_observed',
    'chatgpt_archive_exact_id',
    'runtime_exact_id',
    'manual_exact_url',
    'explicit_retire'
  )),
  identity_evidence_ref text NOT NULL CHECK (length(btrim(identity_evidence_ref)) > 0),
  registered_by text NOT NULL CHECK (length(btrim(registered_by)) > 0),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  supersedes_event_id uuid REFERENCES comind_pm.pm_lane_conversation_binding_events(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_item_id, idempotency_key),
  CHECK (external_conversation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CHECK (registered_conversation_url = 'https://chatgpt.com/c/' || external_conversation_id)
);

CREATE INDEX IF NOT EXISTS pm_lane_conversation_binding_work_item_idx
  ON comind_pm.pm_lane_conversation_binding_events(work_item_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pm_lane_conversation_binding_external_idx
  ON comind_pm.pm_lane_conversation_binding_events(execution_surface, external_conversation_id);

ALTER TABLE comind_pm.pm_lane_conversation_binding_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_deny_all ON comind_pm.pm_lane_conversation_binding_events;
CREATE POLICY private_deny_all ON comind_pm.pm_lane_conversation_binding_events
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_binding_events FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_binding_events FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_binding_events FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON TABLE comind_pm.pm_lane_conversation_binding_events FROM service_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION comind_pm.reject_lane_conversation_binding_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind_pm
AS $$
BEGIN
  RAISE EXCEPTION 'Lane conversation binding events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_lane_conversation_binding_events_append_only
  ON comind_pm.pm_lane_conversation_binding_events;
CREATE TRIGGER trg_lane_conversation_binding_events_append_only
BEFORE UPDATE OR DELETE ON comind_pm.pm_lane_conversation_binding_events
FOR EACH ROW EXECUTE FUNCTION comind_pm.reject_lane_conversation_binding_event_mutation();

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
    'registrationMethod', v_event.registration_method,
    'identityEvidenceRef', v_event.identity_evidence_ref,
    'registeredBy', v_event.registered_by,
    'createdAt', v_event.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.bind_lane_conversation(
  p_work_key text,
  p_external_conversation_id text,
  p_registered_conversation_url text,
  p_observed_title text,
  p_registration_method text,
  p_identity_evidence_ref text,
  p_registered_by text,
  p_idempotency_key text,
  p_allow_supersede boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_work_item_id uuid;
  v_existing_idempotent comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_current comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_new comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_conversation_id text;
  v_url text;
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
  IF p_registration_method NOT IN ('cbe_observed','chatgpt_archive_exact_id','runtime_exact_id','manual_exact_url') THEN
    RAISE EXCEPTION 'INVALID_CONVERSATION_REGISTRATION_METHOD:%', p_registration_method;
  END IF;
  IF p_identity_evidence_ref IS NULL OR length(btrim(p_identity_evidence_ref)) = 0 THEN
    RAISE EXCEPTION 'IDENTITY_EVIDENCE_REF_REQUIRED';
  END IF;
  IF p_registered_by IS NULL OR length(btrim(p_registered_by)) = 0 THEN
    RAISE EXCEPTION 'REGISTERED_BY_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_METADATA_MUST_BE_OBJECT';
  END IF;

  SELECT id INTO v_work_item_id
  FROM comind_pm.pm_work_items
  WHERE work_key = btrim(p_work_key);
  IF v_work_item_id IS NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND:%', btrim(p_work_key);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lane-conversation:' || btrim(p_work_key), 0));

  SELECT * INTO v_existing_idempotent
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing_idempotent.event_type <> 'bound'
       OR v_existing_idempotent.external_conversation_id <> v_conversation_id
       OR v_existing_idempotent.registered_conversation_url <> v_url THEN
      RAISE EXCEPTION 'LANE_CONVERSATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'active',
      'workKey', btrim(p_work_key),
      'bindingEventId', v_existing_idempotent.id,
      'registeredConversationUrl', v_existing_idempotent.registered_conversation_url,
      'externalConversationId', v_existing_idempotent.external_conversation_id,
      'replayed', true,
      'created', false
    );
  END IF;

  SELECT * INTO v_current
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF FOUND AND v_current.event_type = 'bound' THEN
    IF v_current.external_conversation_id = v_conversation_id
       AND v_current.registered_conversation_url = v_url THEN
      RETURN jsonb_build_object(
        'status', 'active',
        'workKey', btrim(p_work_key),
        'bindingEventId', v_current.id,
        'registeredConversationUrl', v_current.registered_conversation_url,
        'externalConversationId', v_current.external_conversation_id,
        'replayed', true,
        'created', false
      );
    END IF;
    IF NOT p_allow_supersede THEN
      RAISE EXCEPTION 'LANE_CONVERSATION_BINDING_CONFLICT:%', btrim(p_work_key);
    END IF;
  END IF;

  INSERT INTO comind_pm.pm_lane_conversation_binding_events(
    work_item_id,
    event_type,
    execution_surface,
    external_conversation_id,
    registered_conversation_url,
    observed_title,
    registration_method,
    identity_evidence_ref,
    registered_by,
    idempotency_key,
    supersedes_event_id,
    metadata
  ) VALUES (
    v_work_item_id,
    'bound',
    'chatgpt',
    v_conversation_id,
    v_url,
    nullif(btrim(coalesce(p_observed_title, '')), ''),
    p_registration_method,
    btrim(p_identity_evidence_ref),
    btrim(p_registered_by),
    btrim(p_idempotency_key),
    CASE WHEN v_current.id IS NULL THEN NULL ELSE v_current.id END,
    p_metadata
  ) RETURNING * INTO v_new;

  RETURN jsonb_build_object(
    'status', 'active',
    'workKey', btrim(p_work_key),
    'bindingEventId', v_new.id,
    'registeredConversationUrl', v_new.registered_conversation_url,
    'externalConversationId', v_new.external_conversation_id,
    'replayed', false,
    'created', true,
    'supersedesEventId', v_new.supersedes_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind_pm.retire_lane_conversation_binding(
  p_work_key text,
  p_identity_evidence_ref text,
  p_registered_by text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind_pm
AS $$
DECLARE
  v_work_item_id uuid;
  v_existing_idempotent comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_current comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
  v_new comind_pm.pm_lane_conversation_binding_events%ROWTYPE;
BEGIN
  IF p_work_key IS NULL OR length(btrim(p_work_key)) = 0 THEN
    RAISE EXCEPTION 'WORK_KEY_REQUIRED';
  END IF;
  IF p_identity_evidence_ref IS NULL OR length(btrim(p_identity_evidence_ref)) = 0 THEN
    RAISE EXCEPTION 'IDENTITY_EVIDENCE_REF_REQUIRED';
  END IF;
  IF p_registered_by IS NULL OR length(btrim(p_registered_by)) = 0 THEN
    RAISE EXCEPTION 'REGISTERED_BY_REQUIRED';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'LANE_CONVERSATION_METADATA_MUST_BE_OBJECT';
  END IF;

  SELECT id INTO v_work_item_id
  FROM comind_pm.pm_work_items
  WHERE work_key = btrim(p_work_key);
  IF v_work_item_id IS NULL THEN
    RAISE EXCEPTION 'WORK_ITEM_NOT_FOUND:%', btrim(p_work_key);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('lane-conversation:' || btrim(p_work_key), 0));

  SELECT * INTO v_existing_idempotent
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
    AND idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing_idempotent.event_type <> 'retired' THEN
      RAISE EXCEPTION 'LANE_CONVERSATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'conversation_binding_inactive',
      'workKey', btrim(p_work_key),
      'bindingEventId', v_existing_idempotent.id,
      'replayed', true,
      'created', false
    );
  END IF;

  SELECT * INTO v_current
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'conversation_binding_missing',
      'workKey', btrim(p_work_key),
      'reason', 'conversation_binding_missing',
      'created', false
    );
  END IF;

  IF v_current.event_type = 'retired' THEN
    RETURN jsonb_build_object(
      'status', 'conversation_binding_inactive',
      'workKey', btrim(p_work_key),
      'bindingEventId', v_current.id,
      'replayed', true,
      'created', false
    );
  END IF;

  INSERT INTO comind_pm.pm_lane_conversation_binding_events(
    work_item_id,
    event_type,
    execution_surface,
    external_conversation_id,
    registered_conversation_url,
    observed_title,
    registration_method,
    identity_evidence_ref,
    registered_by,
    idempotency_key,
    supersedes_event_id,
    metadata
  ) VALUES (
    v_work_item_id,
    'retired',
    v_current.execution_surface,
    v_current.external_conversation_id,
    v_current.registered_conversation_url,
    v_current.observed_title,
    'explicit_retire',
    btrim(p_identity_evidence_ref),
    btrim(p_registered_by),
    btrim(p_idempotency_key),
    v_current.id,
    p_metadata
  ) RETURNING * INTO v_new;

  RETURN jsonb_build_object(
    'status', 'conversation_binding_inactive',
    'workKey', btrim(p_work_key),
    'bindingEventId', v_new.id,
    'replayed', false,
    'created', true,
    'supersedesEventId', v_new.supersedes_event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION comind_pm.resolve_lane_conversation_binding(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.bind_lane_conversation(text,text,text,text,text,text,text,text,boolean,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.retire_lane_conversation_binding(text,text,text,text,jsonb) FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.resolve_lane_conversation_binding(text) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.bind_lane_conversation(text,text,text,text,text,text,text,text,boolean,jsonb) FROM anon;
    REVOKE ALL ON FUNCTION comind_pm.retire_lane_conversation_binding(text,text,text,text,jsonb) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.resolve_lane_conversation_binding(text) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.bind_lane_conversation(text,text,text,text,text,text,text,text,boolean,jsonb) FROM authenticated;
    REVOKE ALL ON FUNCTION comind_pm.retire_lane_conversation_binding(text,text,text,text,jsonb) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION comind_pm.resolve_lane_conversation_binding(text) TO service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.bind_lane_conversation(text,text,text,text,text,text,text,text,boolean,jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION comind_pm.retire_lane_conversation_binding(text,text,text,text,jsonb) TO service_role;
  END IF;
END $$;

COMMENT ON TABLE comind_pm.pm_lane_conversation_binding_events IS
  'Append-only canonical originating-conversation identity history for durable CoMind work items. Exact stable identity only; title is never sufficient authority.';
COMMENT ON FUNCTION comind_pm.resolve_lane_conversation_binding(text) IS
  'Resolve the latest canonical originating conversation for an exact work key without inferring identity from title or conversational similarity.';

COMMIT;
