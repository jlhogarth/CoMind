-- CE-002 recovery-specific idempotency hardening.
-- Scope: Test-first additive constraint over the accepted CE-001 Continuity Capsule substrate.
-- Production activation is not implied by this migration.

CREATE UNIQUE INDEX IF NOT EXISTS cm_ce_recovery_capsule_source_uq
  ON comind.cm_ce_continuity_capsule (
    project_id,
    task_id,
    capsule_key,
    source_ref
  ) NULLS NOT DISTINCT
  WHERE source_system = 'continuous_excellence'
    AND source_ref LIKE 'ce-recovery://%';

COMMENT ON INDEX comind.cm_ce_recovery_capsule_source_uq IS
  'CE-002: one durable Continuity Capsule per recovery interrupt source identity; prevents concurrent replay from manufacturing successor versions.';
