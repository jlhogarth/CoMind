-- CINT-GOV-001 verification for 20261027_010_cint_identity_reconciliation_guards.sql.
-- Structural checks plus bounded transactional behavior proof using the installed CHECK definitions.

DO $$
DECLARE
    v_reconciled_def text;
    v_failed_def text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgrelid = 'comind.cm_project'::regclass
          AND tgname = 'trg_cm_project_project_code_immutable'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Canonical project_code immutability trigger is missing';
    END IF;

    SELECT pg_get_constraintdef(oid, true)
    INTO v_reconciled_def
    FROM pg_constraint
    WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
      AND conname = 'cm_paid_api_execution_reconciled_actuals_ck';

    IF v_reconciled_def IS NULL
       OR position('execution_status <> ''reconciled''' in v_reconciled_def) = 0
       OR position('reconciled_at IS NOT NULL' in v_reconciled_def) = 0
       OR position('completed_at IS NOT NULL' in v_reconciled_def) = 0
       OR position('actual_expense IS NOT NULL' in v_reconciled_def) = 0 THEN
        RAISE EXCEPTION 'Reconciled execution constraint is missing or incomplete: %', v_reconciled_def;
    END IF;

    SELECT pg_get_constraintdef(oid, true)
    INTO v_failed_def
    FROM pg_constraint
    WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
      AND conname = 'cm_paid_api_execution_failed_report_ck';

    IF v_failed_def IS NULL
       OR position('execution_status <> ''failed''' in v_failed_def) = 0
       OR position('failure_report IS NOT NULL' in v_failed_def) = 0
       OR position('btrim(failure_report)' in v_failed_def) = 0 THEN
        RAISE EXCEPTION 'Failed execution report constraint is missing or incomplete: %', v_failed_def;
    END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
    v_cint_project_id uuid;
    v_project_code_rejected boolean := false;
    v_reconciled_def text;
    v_failed_def text;
    v_reconciled_without_actuals_rejected boolean := false;
    v_failed_without_report_rejected boolean := false;
BEGIN
    SELECT project_id INTO v_cint_project_id
    FROM comind.cm_project
    WHERE project_code = 'CINT'::citext;

    IF v_cint_project_id IS NULL THEN
        RAISE EXCEPTION 'CINT canonical project is required for 010 behavior verification';
    END IF;

    BEGIN
        UPDATE comind.cm_project
        SET project_code = 'CINT-CHANGED'::citext
        WHERE project_id = v_cint_project_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_project_code_rejected := true;
    END;

    IF NOT v_project_code_rejected THEN
        RAISE EXCEPTION 'Canonical project_code reassignment was not rejected';
    END IF;

    SELECT pg_get_constraintdef(oid, true)
    INTO v_reconciled_def
    FROM pg_constraint
    WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
      AND conname = 'cm_paid_api_execution_reconciled_actuals_ck';

    SELECT pg_get_constraintdef(oid, true)
    INTO v_failed_def
    FROM pg_constraint
    WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
      AND conname = 'cm_paid_api_execution_failed_report_ck';

    CREATE TEMP TABLE tmp_cint_execution_terminal_contract (
        execution_status text,
        completed_at timestamptz,
        reconciled_at timestamptz,
        actual_expense numeric,
        failure_report text
    ) ON COMMIT DROP;

    EXECUTE format(
        'ALTER TABLE tmp_cint_execution_terminal_contract ADD CONSTRAINT tmp_reconciled_ck %s',
        v_reconciled_def
    );
    EXECUTE format(
        'ALTER TABLE tmp_cint_execution_terminal_contract ADD CONSTRAINT tmp_failed_ck %s',
        v_failed_def
    );

    BEGIN
        INSERT INTO tmp_cint_execution_terminal_contract (
            execution_status, completed_at, reconciled_at, actual_expense
        ) VALUES ('reconciled', now(), now(), NULL);
    EXCEPTION
        WHEN check_violation THEN
            v_reconciled_without_actuals_rejected := true;
    END;

    IF NOT v_reconciled_without_actuals_rejected THEN
        RAISE EXCEPTION 'Installed reconciled constraint accepted a receipt without actual expense';
    END IF;

    INSERT INTO tmp_cint_execution_terminal_contract (
        execution_status, completed_at, reconciled_at, actual_expense
    ) VALUES ('reconciled', now(), now(), 0);

    BEGIN
        INSERT INTO tmp_cint_execution_terminal_contract (
            execution_status, completed_at, failure_report
        ) VALUES ('failed', now(), NULL);
    EXCEPTION
        WHEN check_violation THEN
            v_failed_without_report_rejected := true;
    END;

    IF NOT v_failed_without_report_rejected THEN
        RAISE EXCEPTION 'Installed failed-report constraint accepted a failed receipt without a report';
    END IF;

    INSERT INTO tmp_cint_execution_terminal_contract (
        execution_status, completed_at, failure_report
    ) VALUES ('failed', now(), 'Synthetic bounded failure report');
END;
$$;

ROLLBACK;

SELECT
    'pass' AS status,
    'CINT-GOV-001 stable project_code plus reconciled-actual and failure-report invariants verified' AS detail;
