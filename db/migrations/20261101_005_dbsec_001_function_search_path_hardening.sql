BEGIN;

ALTER FUNCTION comind.current_actor()
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind.fn_belief_update_beta(uuid, boolean, jsonb)
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind.fn_create_causal_node_from_memory(uuid, text, text)
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind.set_current_actor(uuid)
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind.set_updated_at()
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind.set_updated_at_checklist()
  SET search_path = pg_catalog, comind;

ALTER FUNCTION comind_pm.touch_updated_at()
  SET search_path = pg_catalog, comind_pm;

COMMIT;
