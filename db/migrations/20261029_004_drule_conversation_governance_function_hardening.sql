BEGIN;

ALTER FUNCTION comind_pm.conversation_asset_key(uuid)
  SET search_path = pg_catalog, comind_pm;

REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind_pm.conversation_asset_key(uuid) FROM service_role;
  END IF;
END $$;

COMMIT;
