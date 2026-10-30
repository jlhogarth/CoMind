-- CE-001 corrective hardening discovered by destructive verification.
-- Improvement lifecycle state must follow insertion order even when events share a transaction timestamp.

ALTER TABLE comind.cm_ce_improvement_event
  ADD COLUMN IF NOT EXISTS event_ordinal bigint GENERATED ALWAYS AS IDENTITY;

DROP INDEX IF EXISTS comind.cm_ce_improvement_event_latest_idx;
CREATE INDEX IF NOT EXISTS cm_ce_improvement_event_latest_idx
  ON comind.cm_ce_improvement_event (improvement_id, event_ordinal DESC);

CREATE OR REPLACE VIEW comind.v_ce_improvement_state
WITH (security_invoker = true)
AS
SELECT
  i.improvement_id,
  i.project_id,
  i.task_id,
  i.owner_actor_id,
  i.title,
  i.category,
  i.rationale,
  i.created_at,
  latest.event_id AS latest_event_id,
  latest.event_type AS current_state,
  latest.outcome AS current_outcome,
  latest.summary AS latest_summary,
  latest.created_at AS latest_event_at,
  latest.event_ordinal AS latest_event_ordinal
FROM comind.cm_ce_improvement i
LEFT JOIN LATERAL (
  SELECT e.event_id, e.event_ordinal, e.event_type, e.outcome, e.summary, e.created_at
  FROM comind.cm_ce_improvement_event e
  WHERE e.improvement_id = i.improvement_id
  ORDER BY e.event_ordinal DESC
  LIMIT 1
) latest ON true;

COMMENT ON COLUMN comind.cm_ce_improvement_event.event_ordinal IS 'Monotonic database insertion order used to project the latest immutable improvement event without relying on transaction timestamps or random UUID ordering.';
