DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (
    (n.nspname = 'comind' AND p.proname IN (
      'current_actor',
      'fn_belief_update_beta',
      'fn_create_causal_node_from_memory',
      'set_current_actor',
      'set_updated_at',
      'set_updated_at_checklist'
    ))
    OR (n.nspname = 'comind_pm' AND p.proname = 'touch_updated_at')
  )
  AND p.proconfig IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(p.proconfig) cfg
    WHERE cfg = CASE WHEN n.nspname = 'comind_pm'
      THEN 'search_path=pg_catalog, comind_pm'
      ELSE 'search_path=pg_catalog, comind'
    END
  )
  AND p.prosecdef = false;

  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Expected seven SECURITY INVOKER functions with fixed search_path; observed %', v_count;
  END IF;

  IF comind.current_actor() IS NOT NULL THEN
    RAISE EXCEPTION 'current_actor fixture behavior unexpectedly changed';
  END IF;

  PERFORM comind.set_current_actor(gen_random_uuid());
END;
$$;

SELECT jsonb_build_object(
  'status', 'pass',
  'proof', 'DBSEC-001 mutable function search_path hardening',
  'functions_hardened', 7,
  'security_definer_added', false,
  'production_change', false
)::text;
