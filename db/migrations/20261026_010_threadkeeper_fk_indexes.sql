-- TK-004 performance hardening for foreign-key lookups identified by Supabase advisors.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_assessment_scope_checkpoint
  ON comind.cm_threadkeeper_assessment (scope_id, checkpoint_id)
  WHERE checkpoint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_case_scope_assessment
  ON comind.cm_threadkeeper_case (scope_id, opened_from_assessment_id);

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_transition_successor_checkpoint
  ON comind.cm_threadkeeper_case_transition (successor_checkpoint_id)
  WHERE successor_checkpoint_id IS NOT NULL;

COMMIT;
