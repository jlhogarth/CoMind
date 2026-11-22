BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='comind' AND c.relname IN
    ('cm_aed_crp_origin','cm_aed_crp_return','cm_aed_crp_event')
    AND c.relkind='r' AND c.relrowsecurity;
  IF v_count <> 3 THEN RAISE EXCEPTION 'AED-CRP RLS or table invariant failed'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c, LATERAL aclexplode(
      coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE c.oid IN ('comind.cm_aed_crp_return'::regclass,
      'comind.cm_aed_crp_origin'::regclass,'comind.cm_aed_crp_event'::regclass)
      AND a.grantee=0 AND a.privilege_type='SELECT'
  ) THEN
    RAISE EXCEPTION 'AED-CRP public read grant detected';
  END IF;
  IF to_regrole('anon') IS NOT NULL AND
     has_table_privilege('anon','comind.cm_aed_crp_return','SELECT') THEN
    RAISE EXCEPTION 'AED-CRP anon read grant detected';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL AND
     has_table_privilege('authenticated','comind.cm_aed_crp_return','SELECT') THEN
    RAISE EXCEPTION 'AED-CRP authenticated read grant detected';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='comind.cm_aed_crp_event'::regclass
      AND tgname='cm_aed_crp_event_immutable' AND tgenabled='O'
  ) THEN RAISE EXCEPTION 'AED-CRP immutable evidence trigger missing'; END IF;
END;
$$;

ROLLBACK;
