\set ON_ERROR_STOP on

DO $$
DECLARE
  r record;
BEGIN
  SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin,rolreplication,rolbypassrls
    INTO r
    FROM pg_roles
   WHERE rolname='comind_ger_runtime';
  IF NOT FOUND THEN RAISE EXCEPTION 'comind_ger_runtime role missing'; END IF;
  IF r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolcanlogin OR r.rolreplication OR r.rolbypassrls THEN
    RAISE EXCEPTION 'comind_ger_runtime has unsafe role attributes';
  END IF;
END
$$;

DO $$
DECLARE
  table_name text;
  rls_enabled boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cm_epistemic_case','cm_epistemic_object','cm_epistemic_relationship','cm_epistemic_event']
  LOOP
    SELECT c.relrowsecurity INTO rls_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relname=table_name;
    IF rls_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS missing on comind.%', table_name; END IF;
    IF NOT has_table_privilege('comind_ger_runtime',format('comind.%I',table_name),'SELECT')
       OR NOT has_table_privilege('comind_ger_runtime',format('comind.%I',table_name),'INSERT')
       OR has_table_privilege('comind_ger_runtime',format('comind.%I',table_name),'UPDATE')
       OR has_table_privilege('comind_ger_runtime',format('comind.%I',table_name),'DELETE') THEN
      RAISE EXCEPTION 'Unsafe GER runtime privilege shape on %', table_name;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT has_function_privilege('comind_ger_runtime','comind.cm_ger_payload_has_forbidden_key(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'GER runtime cannot execute payload validator';
  END IF;
  IF NOT has_function_privilege('comind_ger_runtime','comind.cm_ger_transition_allowed(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'GER runtime cannot execute transition validator';
  END IF;
END
$$;

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (VALUES
    ('cm_epistemic_relationship_case_fkey','cm_epistemic_relationship','case_id'),
    ('cm_epistemic_relationship_subject_same_case','cm_epistemic_relationship','case_id,subject_object_id'),
    ('cm_epistemic_relationship_object_same_case','cm_epistemic_relationship','case_id,object_object_id'),
    ('cm_epistemic_event_case_id_fkey','cm_epistemic_event','case_id'),
    ('cm_epistemic_event_prior_same_case','cm_epistemic_event','case_id,prior_event_id'),
    ('cm_epistemic_event_object_same_case','cm_epistemic_event','case_id,target_object_id'),
    ('cm_epistemic_event_relationship_same_case','cm_epistemic_event','case_id,target_relationship_id')
  ) expected(name,table_name,columns)
  WHERE NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='comind' AND t.relname=expected.table_name AND c.conname=expected.name AND c.contype='f'
  );
  IF missing_count <> 0 THEN RAISE EXCEPTION 'GER foreign-key contract incomplete: % missing', missing_count; END IF;
END
$$;

BEGIN;
SET LOCAL ROLE comind_ger_runtime;

DO $$
BEGIN
  BEGIN
    INSERT INTO comind.cm_epistemic_case (
      case_key,subject_ref,purpose,environment,initial_rigor_class,policy_version,
      data_classification,retention_profile_key,source_refs,opened_at,opened_by_ref,case_digest,case_payload
    ) VALUES (
      'verify-forbidden-payload','verify:subject','Payload safety proof','test',1,'ger-001-v1',
      'INTERNAL','DURABLE-EVIDENCE','[]'::jsonb,now(),'verify:actor',repeat('a',64),'{"chain_of_thought":"must-not-persist"}'::jsonb
    );
    RAISE EXCEPTION 'Forbidden GER payload unexpectedly persisted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

ROLLBACK;

SELECT 'GER-002 migration verification PASS' AS result;
