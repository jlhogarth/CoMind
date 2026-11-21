-- IIC-009 scoped Test projection proposal ONLY. Do not apply without separate
-- explicit founder approval of schema, credential and security boundaries.
-- Target Test project sbgfuanxiqepcoboxzcl; no Production.
CREATE OR REPLACE FUNCTION comind_pm.iic_test_lane_state()
RETURNS TABLE (project_key text, work_key text, status text, last_event_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, comind_pm, pg_temp
AS $iic$
  SELECT
    encode(sha256(convert_to(v.project_key, 'UTF8')), 'hex'),
    encode(sha256(convert_to(v.work_key, 'UTF8')), 'hex'),
    v.status,
    v.last_event_at
  FROM comind_pm.v_runbook_lane_state v
  WHERE v.project_key = 'COMIND'
    AND v.work_key IS NOT NULL AND v.last_event_at IS NOT NULL
  ORDER BY v.last_event_at DESC, v.work_key ASC LIMIT 1
$iic$;
REVOKE ALL ON FUNCTION comind_pm.iic_test_lane_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind_pm.iic_test_lane_state() FROM anon;
REVOKE ALL ON FUNCTION comind_pm.iic_test_lane_state() FROM authenticated;
-- No role is created, no login is granted, no DML or underlying table SELECT.
-- An approved independent security lane must grant schema USAGE and this
-- function's EXECUTE to one purpose-built restricted Test reader only.
