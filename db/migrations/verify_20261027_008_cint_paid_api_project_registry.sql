-- CINT-GOV-001 verification for 20261027_008 plus 20261027_009 hardening.
-- Read-only structural, provenance, immutability, and privilege verification.

DO $$
DECLARE
    v_missing text[];
    v_root_project_id uuid;
    v_cint_project_id uuid;
    v_cint_parent_id uuid;
    v_pm_bridge_id uuid;
    v_policy_agent_id uuid;
    v_policy_profile_id uuid;
    v_policy_binding_status text;
    v_policy_acceptance_status text;
    v_policy_ongoing boolean;
    v_count integer;
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_project_link'),
            ('comind.cm_paid_api_access_proposal'),
            ('comind.cm_paid_api_execution'),
            ('comind.cm_agent_operating_policy'),
            ('comind.cm_paid_api_access_analysis_v'),
            ('comind.cm_agent_operating_policy_current_v')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing CINT-GOV-001 relations: %', v_missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_project'
          AND column_name = 'project_code'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_project'
          AND column_name = 'acronym'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_project'
          AND column_name = 'parent_project_id'
    ) THEN
        RAISE EXCEPTION 'Canonical project identity columns are incomplete';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind_pm'
          AND table_name = 'pm_projects'
          AND column_name = 'canonical_project_id'
    ) THEN
        RAISE EXCEPTION 'PM project canonical bridge column is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_paid_api_execution'
          AND column_name = 'tool_calls_made'
    ) THEN
        RAISE EXCEPTION 'Paid API actual tool-call usage column is missing';
    END IF;

    SELECT project_id INTO v_root_project_id
    FROM comind.cm_project
    WHERE project_code = 'COMIND'::citext
      AND acronym = 'COMIND'::citext
      AND slug = 'comind'::citext;

    IF v_root_project_id IS NULL THEN
        RAISE EXCEPTION 'Canonical COMIND project identity is missing';
    END IF;

    SELECT project_id, parent_project_id
    INTO v_cint_project_id, v_cint_parent_id
    FROM comind.cm_project
    WHERE project_code = 'CINT'::citext
      AND acronym = 'CINT'::citext
      AND slug = 'competitive-intelligence'::citext
      AND source_ref = 'github:issue:259';

    IF v_cint_project_id IS NULL THEN
        RAISE EXCEPTION 'Canonical CINT project identity is missing';
    END IF;
    IF v_cint_parent_id IS DISTINCT FROM v_root_project_id THEN
        RAISE EXCEPTION 'CINT parent project does not resolve to COMIND';
    END IF;

    SELECT canonical_project_id INTO v_pm_bridge_id
    FROM comind_pm.pm_projects
    WHERE project_key = 'COMIND';

    IF v_pm_bridge_id IS DISTINCT FROM v_root_project_id THEN
        RAISE EXCEPTION 'COMIND PM project does not bridge to canonical COMIND project';
    END IF;

    SELECT count(*) INTO v_count
    FROM comind.cm_project_link
    WHERE project_id = v_cint_project_id
      AND system = 'github'
      AND external_id IN ('issue:259', 'issue:274');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected CINT GitHub operating/governance links, found %', v_count;
    END IF;

    SELECT
        agent_id,
        profile_id,
        binding_status,
        acceptance_status,
        ongoing_operation_allowed
    INTO
        v_policy_agent_id,
        v_policy_profile_id,
        v_policy_binding_status,
        v_policy_acceptance_status,
        v_policy_ongoing
    FROM comind.cm_agent_operating_policy
    WHERE policy_key = 'CINT-OPS-001'
      AND policy_version = '0.2';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CINT-OPS-001 operating policy revision 0.2 is missing';
    END IF;
    IF v_policy_agent_id IS NOT NULL OR v_policy_profile_id IS NOT NULL THEN
        RAISE EXCEPTION 'CINT operating policy must remain unbound until canonical role reconciliation';
    END IF;
    IF v_policy_binding_status <> 'unbound'
       OR v_policy_acceptance_status <> 'not_accepted'
       OR v_policy_ongoing THEN
        RAISE EXCEPTION 'CINT operating policy overstates current operational acceptance';
    END IF;

    SELECT count(*) INTO v_count
    FROM comind.cm_agent_operating_policy_current_v
    WHERE policy_key = 'CINT-OPS-001'
      AND policy_version = '0.2';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected current CINT-OPS-001 policy revision projection, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relname IN (
          'cm_project_link',
          'cm_paid_api_access_proposal',
          'cm_paid_api_execution',
          'cm_agent_operating_policy'
      )
      AND c.relkind = 'r'
      AND c.relrowsecurity;

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'All four new private CINT governance tables must have RLS enabled; found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.table_privileges
        WHERE table_schema = 'comind'
          AND table_name IN (
              'cm_project_link',
              'cm_paid_api_access_proposal',
              'cm_paid_api_execution',
              'cm_agent_operating_policy',
              'cm_paid_api_access_analysis_v',
              'cm_agent_operating_policy_current_v'
          )
          AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ) THEN
        RAISE EXCEPTION 'CINT governance objects expose privileges to anon/authenticated/PUBLIC';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'comind.cm_paid_api_access_proposal'::regclass
          AND tgname = 'trg_cm_paid_api_access_proposal_guard'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Paid API proposal scope/delete guard trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'comind.cm_paid_api_execution'::regclass
          AND tgname = 'trg_cm_paid_api_execution_validate_insert'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Paid API execution authority validation trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'comind.cm_paid_api_execution'::regclass
          AND tgname = 'trg_cm_paid_api_execution_guard_mutation'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Paid API execution immutability guard trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'comind.cm_agent_operating_policy'::regclass
          AND tgname = 'trg_cm_agent_operating_policy_immutable'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Agent operating policy revision immutability trigger is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_proposal_attempt_uq'
    ) THEN
        RAISE EXCEPTION 'Paid API proposal/attempt uniqueness constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_tool_calls_ck'
    ) THEN
        RAISE EXCEPTION 'Paid API tool-call actuals constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_access_proposal'::regclass
          AND conname = 'cm_paid_api_access_proposal_cost_ck'
    ) THEN
        RAISE EXCEPTION 'Paid API estimate/max-spend constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_access_proposal'::regclass
          AND conname = 'cm_paid_api_access_proposal_completed_approval_ck'
    ) THEN
        RAISE EXCEPTION 'Completed proposal approval-provenance constraint is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_agent_operating_policy'::regclass
          AND conname = 'cm_agent_operating_policy_key_version_uq'
    ) THEN
        RAISE EXCEPTION 'Agent operating policy revision uniqueness constraint is missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_agent_operating_policy'::regclass
          AND conname = 'cm_agent_operating_policy_policy_key_key'
    ) THEN
        RAISE EXCEPTION 'Legacy policy_key-only uniqueness still blocks append-only policy revisions';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relname IN ('cm_paid_api_access_analysis_v', 'cm_agent_operating_policy_current_v')
      AND c.relkind = 'v'
      AND COALESCE(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']::text[];

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Both CINT analysis/current-policy views must use security_invoker=true; found %', v_count;
    END IF;
END;
$$;

SELECT
    'pass' AS status,
    'CINT-GOV-001 project identity, founder cap dominance, durable paid API evidence, append-only agent policy, RLS, and private analysis verified' AS detail;
