BEGIN;

DO $$
DECLARE
  v_org_id uuid;
  v_project_id uuid;
  v_target_count integer;
  v_partial_count integer;
  v_conflict_count integer;
BEGIN
  SELECT o.org_id
    INTO v_org_id
  FROM comind.cm_org o
  WHERE o.slug::text = 'comind';

  SELECT p.project_id
    INTO v_project_id
  FROM comind.cm_project p
  WHERE p.slug::text = 'comind'
    AND p.org_id = v_org_id;

  IF v_org_id IS NULL OR v_project_id IS NULL THEN
    RAISE EXCEPTION 'CGA_SCOPE_CANONICAL_COMIND_SCOPE_MISSING';
  END IF;

  SELECT count(*)
    INTO v_target_count
  FROM comind.cm_conversation c
  WHERE
    (c.source = 'cfr_test'
      AND c.metadata->>'issue' = '176'
      AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'cfr_service_role_test'
      AND c.metadata->>'issue' = '176'
      AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'live'
      AND c.metadata->>'proof' = 'CFR-001C'
      AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live'
      AND c.metadata->>'proof' = 'CFR-001E'
      AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live'
      AND c.metadata->>'lane' = 'CFR-001G'
      AND c.metadata->>'proof' = 'owner_seeded_management_session'
      AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'native_chatgpt_live'
      AND c.metadata->>'synthetic' = 'true'
      AND c.metadata->>'source_system' = 'chatgpt'
      AND c.title LIKE 'CFR-001F Test %');

  IF v_target_count <> 10 THEN
    RAISE EXCEPTION 'CGA_SCOPE_EXPECTED_10_SYNTHETIC_CFR_ROWS_FOUND_%', v_target_count;
  END IF;

  SELECT count(*)
    INTO v_partial_count
  FROM comind.cm_conversation c
  WHERE (
    (c.source = 'cfr_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'cfr_service_role_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001C' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001E' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'lane' = 'CFR-001G' AND c.metadata->>'proof' = 'owner_seeded_management_session' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'native_chatgpt_live' AND c.metadata->>'synthetic' = 'true' AND c.metadata->>'source_system' = 'chatgpt' AND c.title LIKE 'CFR-001F Test %')
  )
  AND ((c.org_id IS NULL) <> (c.project_id IS NULL));

  IF v_partial_count <> 0 THEN
    RAISE EXCEPTION 'CGA_SCOPE_PARTIAL_SCOPE_DETECTED_%', v_partial_count;
  END IF;

  SELECT count(*)
    INTO v_conflict_count
  FROM comind.cm_conversation c
  WHERE (
    (c.source = 'cfr_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'cfr_service_role_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001C' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001E' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'lane' = 'CFR-001G' AND c.metadata->>'proof' = 'owner_seeded_management_session' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'native_chatgpt_live' AND c.metadata->>'synthetic' = 'true' AND c.metadata->>'source_system' = 'chatgpt' AND c.title LIKE 'CFR-001F Test %')
  )
  AND c.org_id IS NOT NULL
  AND (c.org_id IS DISTINCT FROM v_org_id OR c.project_id IS DISTINCT FROM v_project_id);

  IF v_conflict_count <> 0 THEN
    RAISE EXCEPTION 'CGA_SCOPE_EXISTING_SCOPE_CONFLICT_%', v_conflict_count;
  END IF;

  UPDATE comind.cm_conversation c
  SET org_id = v_org_id,
      project_id = v_project_id
  WHERE (
    (c.source = 'cfr_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'cfr_service_role_test' AND c.metadata->>'issue' = '176' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001C' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'proof' = 'CFR-001E' AND c.metadata->>'environment' = 'Test')
    OR (c.source = 'live' AND c.metadata->>'lane' = 'CFR-001G' AND c.metadata->>'proof' = 'owner_seeded_management_session' AND c.metadata->>'synthetic' = 'true')
    OR (c.source = 'native_chatgpt_live' AND c.metadata->>'synthetic' = 'true' AND c.metadata->>'source_system' = 'chatgpt' AND c.title LIKE 'CFR-001F Test %')
  )
  AND c.org_id IS NULL
  AND c.project_id IS NULL;
END $$;

COMMIT;
