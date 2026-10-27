-- CINT-GOV-001 verification for Foundry unit economics and API cost register.

DO $$
DECLARE
    v_missing text[];
    v_count integer;
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_api_cost_receipt'),
            ('comind.cm_provider_invoice'),
            ('comind.cm_provider_invoice_receipt_link'),
            ('comind.cm_foundry_escalation_event'),
            ('comind.cm_foundry_deliverable_cost_allocation'),
            ('comind.cm_api_cost_register_v'),
            ('comind.cm_foundry_task_economics_v'),
            ('comind.cm_foundry_model_economics_v'),
            ('comind.cm_foundry_deliverable_economics_v'),
            ('comind.cm_foundry_escalation_metrics_v'),
            ('comind.cm_foundry_project_unit_economics_v'),
            ('comind.cm_provider_invoice_reconciliation_v'),
            ('comind.cm_unattributed_paid_usage_v')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing CINT unit-economics objects: %', v_missing;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_paid_api_execution'
          AND column_name = 'foundry_execution_context_id'
    ) THEN
        RAISE EXCEPTION 'Paid API execution Foundry-context attribution column is missing';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND (
          (tgrelid = 'comind.cm_paid_api_execution'::regclass
           AND tgname IN (
               'trg_cm_paid_api_execution_validate_foundry_context',
               'trg_cm_paid_api_execution_foundry_context_immutable',
               'trg_cm_paid_api_execution_issue_cost_receipt'
           ))
          OR
          (tgrelid = 'comind.cm_api_cost_receipt'::regclass
           AND tgname = 'trg_cm_api_cost_receipt_guard')
          OR
          (tgrelid = 'comind.cm_foundry_deliverable_cost_allocation'::regclass
           AND tgname IN ('trg_cm_foundry_deliverable_validate', 'trg_cm_foundry_deliverable_guard'))
          OR
          (tgrelid = 'comind.cm_foundry_escalation_event'::regclass
           AND tgname = 'trg_cm_foundry_escalation_validate_context')
      );

    IF v_count <> 7 THEN
        RAISE EXCEPTION 'Expected seven unit-economics/receipt control triggers, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relname IN (
          'cm_api_cost_receipt',
          'cm_provider_invoice',
          'cm_provider_invoice_receipt_link',
          'cm_foundry_escalation_event',
          'cm_foundry_deliverable_cost_allocation'
      )
      AND c.relkind = 'r'
      AND c.relrowsecurity;

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'All five new financial/unit-economics tables must have RLS enabled; found %', v_count;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.table_privileges
        WHERE table_schema = 'comind'
          AND table_name IN (
              'cm_api_cost_receipt',
              'cm_provider_invoice',
              'cm_provider_invoice_receipt_link',
              'cm_foundry_escalation_event',
              'cm_foundry_deliverable_cost_allocation',
              'cm_api_cost_register_v',
              'cm_foundry_task_economics_v',
              'cm_foundry_model_economics_v',
              'cm_foundry_deliverable_economics_v',
              'cm_foundry_escalation_metrics_v',
              'cm_foundry_project_unit_economics_v',
              'cm_provider_invoice_reconciliation_v',
              'cm_unattributed_paid_usage_v'
          )
          AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ) THEN
        RAISE EXCEPTION 'CINT financial/unit-economics objects expose privileges to anon/authenticated/PUBLIC';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'comind'
      AND c.relname IN (
          'cm_api_cost_register_v',
          'cm_foundry_task_economics_v',
          'cm_foundry_model_economics_v',
          'cm_foundry_deliverable_economics_v',
          'cm_foundry_escalation_metrics_v',
          'cm_foundry_project_unit_economics_v',
          'cm_provider_invoice_reconciliation_v',
          'cm_unattributed_paid_usage_v'
      )
      AND c.relkind = 'v'
      AND COALESCE(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']::text[];

    IF v_count <> 8 THEN
        RAISE EXCEPTION 'All eight financial analysis views must use security_invoker=true; found %', v_count;
    END IF;
END;
$$;

SELECT
    'pass' AS status,
    'Foundry task/model/deliverable/escalation economics, automatic API cost receipts, provider invoice register, RLS, and private analysis views verified' AS detail;
