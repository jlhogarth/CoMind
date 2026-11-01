BEGIN;

ALTER TABLE comind_pm.pm_lane_conversation_binding_events
  ALTER COLUMN created_at SET DEFAULT clock_timestamp();

COMMENT ON COLUMN comind_pm.pm_lane_conversation_binding_events.created_at IS
  'Wall-clock event time. Uses clock_timestamp so successive append-only binding events within one transaction retain deterministic temporal ordering.';

COMMIT;
