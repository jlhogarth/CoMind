-- CINT-GOV-001 final invariants: stable project codes and truthful reconciliation receipts.
-- Issue: https://github.com/jlhogarth/CoMind/issues/274
-- Parent: https://github.com/jlhogarth/CoMind/issues/259

BEGIN;

DO $$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_project'),
            ('comind.cm_paid_api_execution')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-GOV-001 identity/reconciliation hardening requires relations: %', v_missing;
    END IF;
END;
$$;

-- project_code is the durable human key used to resolve canonical project identity.
-- It may be assigned to a legacy project once, but after assignment it cannot be
-- cleared or changed. Human-facing title, description, acronym, hierarchy, and
-- provenance may still evolve through separately governed project maintenance.
CREATE OR REPLACE FUNCTION comind.cm_guard_canonical_project_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    IF OLD.project_code IS NOT NULL
       AND NEW.project_code IS DISTINCT FROM OLD.project_code THEN
        RAISE EXCEPTION 'Canonical project_code % is immutable once assigned', OLD.project_code;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_project_project_code_immutable
    ON comind.cm_project;
CREATE TRIGGER trg_cm_project_project_code_immutable
BEFORE UPDATE OF project_code ON comind.cm_project
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_canonical_project_code();

COMMENT ON FUNCTION comind.cm_guard_canonical_project_code() IS
    'Prevents reassignment or clearing of a canonical project_code after first assignment.';

-- A receipt is not reconciled until it has both a reconciliation timestamp and
-- the actual expense used for estimate-vs-actual analysis. Zero is a valid cost.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_reconciled_actuals_ck'
    ) THEN
        ALTER TABLE comind.cm_paid_api_execution
            ADD CONSTRAINT cm_paid_api_execution_reconciled_actuals_ck
            CHECK (
                execution_status <> 'reconciled'
                OR (
                    reconciled_at IS NOT NULL
                    AND completed_at IS NOT NULL
                    AND actual_expense IS NOT NULL
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_failed_report_ck'
    ) THEN
        ALTER TABLE comind.cm_paid_api_execution
            ADD CONSTRAINT cm_paid_api_execution_failed_report_ck
            CHECK (
                execution_status <> 'failed'
                OR (
                    failure_report IS NOT NULL
                    AND btrim(failure_report) <> ''
                )
            );
    END IF;
END;
$$;

COMMENT ON COLUMN comind.cm_paid_api_execution.reconciled_at IS
    'Set only when actual expense has been reconciled for the execution receipt.';
COMMENT ON COLUMN comind.cm_paid_api_execution.actual_expense IS
    'Actual reconciled expense for this execution; required when execution_status is reconciled. Zero is valid.';
COMMENT ON COLUMN comind.cm_paid_api_execution.failure_report IS
    'Required non-empty failure report when execution_status is failed.';

COMMIT;
