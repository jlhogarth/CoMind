DO $$
DECLARE
  v_config text;
BEGIN
  SELECT coalesce(array_to_string(p.proconfig, ','),'')
    INTO v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'comind_pm'
    AND p.proname = 'conversation_asset_key'
    AND pg_get_function_identity_arguments(p.oid) = 'p_conversation_id uuid';

  IF v_config NOT LIKE '%search_path=pg_catalog, comind_pm%' THEN
    RAISE EXCEPTION 'conversation_asset_key search_path is not pinned: %', v_config;
  END IF;

  IF has_function_privilege('anon','comind_pm.conversation_asset_key(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','comind_pm.conversation_asset_key(uuid)','EXECUTE')
     OR has_function_privilege('service_role','comind_pm.conversation_asset_key(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'conversation_asset_key helper execution leaked to application roles';
  END IF;
END $$;
