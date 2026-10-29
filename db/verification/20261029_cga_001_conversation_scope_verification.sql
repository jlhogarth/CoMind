DO $$
DECLARE
  v_org_id uuid;
  v_project_id uuid;
  v_scoped integer;
  v_unrelated_unscoped integer;
  v_partial integer;
BEGIN
  SELECT org_id INTO v_org_id FROM comind.cm_org WHERE slug='comind';
  SELECT project_id INTO v_project_id FROM comind.cm_project WHERE slug='comind' AND org_id=v_org_id;

  SELECT count(*) INTO v_scoped
  FROM comind.cm_conversation c
  WHERE c.org_id=v_org_id
    AND c.project_id=v_project_id
    AND (
      (c.source='cfr_test' AND c.metadata->>'issue'='176' AND c.metadata->>'synthetic'='true')
      OR (c.source='cfr_service_role_test' AND c.metadata->>'issue'='176' AND c.metadata->>'synthetic'='true')
      OR (c.source='live' AND c.metadata->>'proof'='CFR-001C' AND c.metadata->>'environment'='Test')
      OR (c.source='live' AND c.metadata->>'proof'='CFR-001E' AND c.metadata->>'environment'='Test')
      OR (c.source='live' AND c.metadata->>'lane'='CFR-001G' AND c.metadata->>'proof'='owner_seeded_management_session' AND c.metadata->>'synthetic'='true')
      OR (c.source='native_chatgpt_live' AND c.metadata->>'synthetic'='true' AND c.metadata->>'source_system'='chatgpt' AND c.title LIKE 'CFR-001F Test %')
    );

  IF v_scoped <> 10 THEN
    RAISE EXCEPTION 'CGA_SCOPE_VERIFY_EXPECTED_10_SCOPED_FOUND_%', v_scoped;
  END IF;

  SELECT count(*) INTO v_unrelated_unscoped
  FROM comind.cm_conversation
  WHERE conv_id='99999999-0000-4000-8000-000000000001'
    AND org_id IS NULL
    AND project_id IS NULL;

  IF v_unrelated_unscoped <> 1 THEN
    RAISE EXCEPTION 'CGA_SCOPE_VERIFY_UNRELATED_ROW_WAS_CHANGED';
  END IF;

  SELECT count(*) INTO v_partial
  FROM comind.cm_conversation
  WHERE (org_id IS NULL) <> (project_id IS NULL);

  IF v_partial <> 0 THEN
    RAISE EXCEPTION 'CGA_SCOPE_VERIFY_PARTIAL_SCOPE_%', v_partial;
  END IF;
END $$;

SELECT
  count(*) FILTER (WHERE org_id IS NOT NULL AND project_id IS NOT NULL) AS scoped_conversations,
  count(*) FILTER (WHERE org_id IS NULL AND project_id IS NULL) AS deliberately_unscoped_conversations
FROM comind.cm_conversation;
