-- CINT-GOV-001: Foundry unit economics, API transaction receipts, provider invoice register.
-- Issue: https://github.com/jlhogarth/CoMind/issues/274
-- Parent: https://github.com/jlhogarth/CoMind/issues/259
-- Scope: private financial attribution and audit controls. No provider call is performed.

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
            ('comind.cm_task'),
            ('comind.cm_foundry_execution_context'),
            ('comind.cm_foundry_execution_outcome'),
            ('comind.cm_foundry_authorization_request'),
            ('comind.cm_foundry_authorization_decision'),
            ('comind.cm_paid_api_access_proposal'),
            ('comind.cm_paid_api_execution'),
            ('public.comind_service_providers'),
            ('public.comind_usage_events')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-GOV-001 unit economics requires existing relations: %', v_missing;
    END IF;
END;
$$;

-- Bind a paid execution to the Foundry execution context that incurred it. Task identity
-- is intentionally derived from the execution context rather than copied into the execution row.
ALTER TABLE comind.cm_paid_api_execution
    ADD COLUMN IF NOT EXISTS foundry_execution_context_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_foundry_context_fkey'
    ) THEN
        ALTER TABLE comind.cm_paid_api_execution
            ADD CONSTRAINT cm_paid_api_execution_foundry_context_fkey
            FOREIGN KEY (foundry_execution_context_id)
            REFERENCES comind.cm_foundry_execution_context(execution_context_id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS cm_paid_api_execution_foundry_context_idx
    ON comind.cm_paid_api_execution(foundry_execution_context_id)
    WHERE foundry_execution_context_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_validate_paid_api_execution_foundry_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
DECLARE
    v_context_project_id uuid;
    v_proposal_project_id uuid;
BEGIN
    IF NEW.foundry_execution_context_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT project_id
    INTO v_context_project_id
    FROM comind.cm_foundry_execution_context
    WHERE execution_context_id = NEW.foundry_execution_context_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Foundry execution context % does not exist', NEW.foundry_execution_context_id;
    END IF;

    SELECT project_id
    INTO v_proposal_project_id
    FROM comind.cm_paid_api_access_proposal
    WHERE proposal_id = NEW.proposal_id;

    IF v_context_project_id IS DISTINCT FROM v_proposal_project_id THEN
        RAISE EXCEPTION 'Foundry execution context project does not match paid API proposal project';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_validate_foundry_context
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_validate_foundry_context
BEFORE INSERT OR UPDATE OF foundry_execution_context_id, proposal_id
ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_paid_api_execution_foundry_context();

CREATE OR REPLACE FUNCTION comind.cm_guard_paid_api_execution_foundry_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    IF OLD.foundry_execution_context_id IS DISTINCT FROM NEW.foundry_execution_context_id THEN
        RAISE EXCEPTION 'Paid API Foundry execution-context attribution is immutable after admission';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_foundry_context_immutable
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_foundry_context_immutable
BEFORE UPDATE OF foundry_execution_context_id
ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_paid_api_execution_foundry_context();

-- Internal receipts are CoMind-generated transaction records. They are deliberately
-- distinct from provider-issued invoices and are generated only for reconciled executions.
CREATE SEQUENCE IF NOT EXISTS comind.cm_api_cost_receipt_number_seq;

CREATE TABLE IF NOT EXISTS comind.cm_api_cost_receipt (
    receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number text NOT NULL UNIQUE,
    execution_id uuid NOT NULL UNIQUE
        REFERENCES comind.cm_paid_api_execution(execution_id) ON DELETE RESTRICT,
    proposal_id uuid NOT NULL
        REFERENCES comind.cm_paid_api_access_proposal(proposal_id) ON DELETE RESTRICT,
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    foundry_execution_context_id uuid
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    task_id uuid
        REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    provider_id bigint NOT NULL
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    provider_code text NOT NULL,
    model_or_service text NOT NULL,
    provider_event_id text,
    request_count integer NOT NULL,
    retry_count integer NOT NULL,
    input_tokens bigint,
    cached_input_tokens bigint,
    output_tokens bigint,
    reasoning_tokens bigint,
    total_tokens bigint,
    tool_calls integer,
    actual_cost numeric(18,8) NOT NULL,
    provider_reported_cost numeric(18,8),
    currency text NOT NULL,
    transaction_at timestamptz NOT NULL,
    source_kind text NOT NULL DEFAULT 'reconciled_paid_api_execution',
    source_ref text NOT NULL,
    drive_sync_status text NOT NULL DEFAULT 'pending',
    drive_register_file_id text,
    drive_row_key text,
    drive_synced_at timestamptz,
    drive_sync_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_api_cost_receipt_number_ck CHECK (
        receipt_number ~ '^COMIND-API-[0-9]{8}-[0-9]{10}$'
    ),
    CONSTRAINT cm_api_cost_receipt_requests_ck CHECK (request_count >= 0),
    CONSTRAINT cm_api_cost_receipt_retries_ck CHECK (retry_count >= 0),
    CONSTRAINT cm_api_cost_receipt_cost_ck CHECK (actual_cost >= 0),
    CONSTRAINT cm_api_cost_receipt_provider_cost_ck CHECK (
        provider_reported_cost IS NULL OR provider_reported_cost >= 0
    ),
    CONSTRAINT cm_api_cost_receipt_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cm_api_cost_receipt_source_ck CHECK (btrim(source_ref) <> ''),
    CONSTRAINT cm_api_cost_receipt_drive_status_ck CHECK (
        drive_sync_status IN ('pending', 'synced', 'error', 'not_required')
    ),
    CONSTRAINT cm_api_cost_receipt_drive_synced_ck CHECK (
        drive_sync_status <> 'synced'
        OR (
            drive_register_file_id IS NOT NULL
            AND drive_row_key IS NOT NULL
            AND drive_synced_at IS NOT NULL
        )
    )
);

CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_project_time_idx
    ON comind.cm_api_cost_receipt(project_id, transaction_at DESC);
CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_task_time_idx
    ON comind.cm_api_cost_receipt(task_id, transaction_at DESC)
    WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_model_time_idx
    ON comind.cm_api_cost_receipt(provider_id, model_or_service, transaction_at DESC);
CREATE INDEX IF NOT EXISTS cm_api_cost_receipt_drive_sync_idx
    ON comind.cm_api_cost_receipt(drive_sync_status, transaction_at)
    WHERE drive_sync_status IN ('pending', 'error');

COMMENT ON TABLE comind.cm_api_cost_receipt IS
    'Immutable CoMind internal API transaction receipt generated from each reconciled paid API execution. It is not a provider-issued invoice.';
COMMENT ON COLUMN comind.cm_api_cost_receipt.drive_sync_status IS
    'Audit-mirror state for the human-readable Google Drive register. Supabase remains the authoritative financial ledger.';

CREATE OR REPLACE FUNCTION comind.cm_issue_api_cost_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_project_id uuid;
    v_provider_id bigint;
    v_model_or_service text;
    v_provider_code text;
    v_task_id uuid;
    v_receipt_number text;
BEGIN
    IF NEW.execution_status <> 'reconciled' THEN
        RETURN NEW;
    END IF;

    IF NEW.actual_expense IS NULL OR NEW.reconciled_at IS NULL THEN
        RAISE EXCEPTION 'Cannot issue internal API cost receipt until actual expense and reconciliation time are present';
    END IF;

    IF EXISTS (
        SELECT 1 FROM comind.cm_api_cost_receipt
        WHERE execution_id = NEW.execution_id
    ) THEN
        RETURN NEW;
    END IF;

    SELECT p.project_id, p.provider_id, p.model_or_service, sp.provider_code
    INTO v_project_id, v_provider_id, v_model_or_service, v_provider_code
    FROM comind.cm_paid_api_access_proposal AS p
    JOIN public.comind_service_providers AS sp ON sp.id = p.provider_id
    WHERE p.proposal_id = NEW.proposal_id;

    IF NEW.foundry_execution_context_id IS NOT NULL THEN
        SELECT task_id INTO v_task_id
        FROM comind.cm_foundry_execution_context
        WHERE execution_context_id = NEW.foundry_execution_context_id;
    END IF;

    v_receipt_number := format(
        'COMIND-API-%s-%s',
        to_char(NEW.reconciled_at AT TIME ZONE 'UTC', 'YYYYMMDD'),
        lpad(nextval('comind.cm_api_cost_receipt_number_seq')::text, 10, '0')
    );

    INSERT INTO comind.cm_api_cost_receipt (
        receipt_number,
        execution_id,
        proposal_id,
        project_id,
        foundry_execution_context_id,
        task_id,
        provider_id,
        provider_code,
        model_or_service,
        provider_event_id,
        request_count,
        retry_count,
        input_tokens,
        cached_input_tokens,
        output_tokens,
        reasoning_tokens,
        total_tokens,
        tool_calls,
        actual_cost,
        provider_reported_cost,
        currency,
        transaction_at,
        source_ref
    ) VALUES (
        v_receipt_number,
        NEW.execution_id,
        NEW.proposal_id,
        v_project_id,
        NEW.foundry_execution_context_id,
        v_task_id,
        v_provider_id,
        v_provider_code,
        v_model_or_service,
        NEW.provider_event_id,
        NEW.requests_made,
        NEW.retries_used,
        NEW.actual_input_tokens,
        NEW.actual_cached_input_tokens,
        NEW.actual_output_tokens,
        NEW.actual_reasoning_tokens,
        NEW.actual_total_tokens,
        NEW.tool_calls_made,
        NEW.actual_expense,
        NEW.provider_reported_expense,
        NEW.currency,
        NEW.reconciled_at,
        'comind.cm_paid_api_execution:' || NEW.execution_id::text
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_issue_cost_receipt
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_issue_cost_receipt
AFTER INSERT OR UPDATE OF execution_status, actual_expense, reconciled_at
ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_issue_api_cost_receipt();

CREATE OR REPLACE FUNCTION comind.cm_guard_api_cost_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Internal API cost receipts are durable financial evidence and cannot be deleted';
    END IF;

    IF OLD.receipt_number IS DISTINCT FROM NEW.receipt_number
       OR OLD.execution_id IS DISTINCT FROM NEW.execution_id
       OR OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
       OR OLD.project_id IS DISTINCT FROM NEW.project_id
       OR OLD.foundry_execution_context_id IS DISTINCT FROM NEW.foundry_execution_context_id
       OR OLD.task_id IS DISTINCT FROM NEW.task_id
       OR OLD.provider_id IS DISTINCT FROM NEW.provider_id
       OR OLD.provider_code IS DISTINCT FROM NEW.provider_code
       OR OLD.model_or_service IS DISTINCT FROM NEW.model_or_service
       OR OLD.provider_event_id IS DISTINCT FROM NEW.provider_event_id
       OR OLD.request_count IS DISTINCT FROM NEW.request_count
       OR OLD.retry_count IS DISTINCT FROM NEW.retry_count
       OR OLD.input_tokens IS DISTINCT FROM NEW.input_tokens
       OR OLD.cached_input_tokens IS DISTINCT FROM NEW.cached_input_tokens
       OR OLD.output_tokens IS DISTINCT FROM NEW.output_tokens
       OR OLD.reasoning_tokens IS DISTINCT FROM NEW.reasoning_tokens
       OR OLD.total_tokens IS DISTINCT FROM NEW.total_tokens
       OR OLD.tool_calls IS DISTINCT FROM NEW.tool_calls
       OR OLD.actual_cost IS DISTINCT FROM NEW.actual_cost
       OR OLD.provider_reported_cost IS DISTINCT FROM NEW.provider_reported_cost
       OR OLD.currency IS DISTINCT FROM NEW.currency
       OR OLD.transaction_at IS DISTINCT FROM NEW.transaction_at
       OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
       OR OLD.source_ref IS DISTINCT FROM NEW.source_ref
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'Internal API cost receipt financial facts are immutable';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_api_cost_receipt_guard
    ON comind.cm_api_cost_receipt;
CREATE TRIGGER trg_cm_api_cost_receipt_guard
BEFORE UPDATE OR DELETE ON comind.cm_api_cost_receipt
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_api_cost_receipt();

-- Official provider billing documents are registered separately from internal receipts.
CREATE TABLE IF NOT EXISTS comind.cm_provider_invoice (
    provider_invoice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id bigint NOT NULL
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    invoice_number text NOT NULL,
    billing_period_start date,
    billing_period_end date,
    issued_at timestamptz,
    due_at timestamptz,
    currency text NOT NULL DEFAULT 'USD',
    subtotal numeric(18,8),
    tax_amount numeric(18,8),
    total_amount numeric(18,8) NOT NULL,
    official_source_url text,
    drive_archived_file_url text,
    document_sha256 text,
    reconciliation_status text NOT NULL DEFAULT 'unreconciled',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_provider_invoice_number_ck CHECK (btrim(invoice_number) <> ''),
    CONSTRAINT cm_provider_invoice_period_ck CHECK (
        billing_period_end IS NULL
        OR billing_period_start IS NULL
        OR billing_period_end >= billing_period_start
    ),
    CONSTRAINT cm_provider_invoice_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cm_provider_invoice_subtotal_ck CHECK (subtotal IS NULL OR subtotal >= 0),
    CONSTRAINT cm_provider_invoice_tax_ck CHECK (tax_amount IS NULL OR tax_amount >= 0),
    CONSTRAINT cm_provider_invoice_total_ck CHECK (total_amount >= 0),
    CONSTRAINT cm_provider_invoice_hash_ck CHECK (
        document_sha256 IS NULL OR document_sha256 ~ '^[a-fA-F0-9]{64}$'
    ),
    CONSTRAINT cm_provider_invoice_reconciliation_ck CHECK (
        reconciliation_status IN ('unreconciled', 'partial', 'reconciled', 'disputed')
    ),
    CONSTRAINT cm_provider_invoice_provider_number_uq UNIQUE (provider_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS cm_provider_invoice_provider_time_idx
    ON comind.cm_provider_invoice(provider_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS comind.cm_provider_invoice_receipt_link (
    provider_invoice_receipt_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_invoice_id uuid NOT NULL
        REFERENCES comind.cm_provider_invoice(provider_invoice_id) ON DELETE RESTRICT,
    receipt_id uuid NOT NULL UNIQUE
        REFERENCES comind.cm_api_cost_receipt(receipt_id) ON DELETE RESTRICT,
    matched_amount numeric(18,8) NOT NULL,
    currency text NOT NULL,
    matched_at timestamptz NOT NULL DEFAULT now(),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_provider_invoice_receipt_amount_ck CHECK (matched_amount >= 0),
    CONSTRAINT cm_provider_invoice_receipt_currency_ck CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS cm_provider_invoice_receipt_invoice_idx
    ON comind.cm_provider_invoice_receipt_link(provider_invoice_id, matched_at);

CREATE OR REPLACE FUNCTION comind.cm_validate_provider_invoice_receipt_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
DECLARE
    v_invoice_provider bigint;
    v_invoice_currency text;
    v_receipt_provider bigint;
    v_receipt_currency text;
    v_receipt_cost numeric;
BEGIN
    SELECT provider_id, currency
    INTO v_invoice_provider, v_invoice_currency
    FROM comind.cm_provider_invoice
    WHERE provider_invoice_id = NEW.provider_invoice_id;

    SELECT provider_id, currency, actual_cost
    INTO v_receipt_provider, v_receipt_currency, v_receipt_cost
    FROM comind.cm_api_cost_receipt
    WHERE receipt_id = NEW.receipt_id;

    IF v_invoice_provider IS DISTINCT FROM v_receipt_provider THEN
        RAISE EXCEPTION 'Provider invoice and internal receipt provider do not match';
    END IF;
    IF v_invoice_currency IS DISTINCT FROM v_receipt_currency
       OR NEW.currency IS DISTINCT FROM v_receipt_currency THEN
        RAISE EXCEPTION 'Provider invoice and internal receipt currency do not match';
    END IF;
    IF NEW.matched_amount > v_receipt_cost THEN
        RAISE EXCEPTION 'Matched invoice amount % exceeds internal receipt actual cost %', NEW.matched_amount, v_receipt_cost;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_provider_invoice_receipt_validate
    ON comind.cm_provider_invoice_receipt_link;
CREATE TRIGGER trg_cm_provider_invoice_receipt_validate
BEFORE INSERT OR UPDATE ON comind.cm_provider_invoice_receipt_link
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_provider_invoice_receipt_link();

-- Explicit escalation events support frequency, cost-delta, and model/provider transition analysis.
CREATE TABLE IF NOT EXISTS comind.cm_foundry_escalation_event (
    escalation_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    task_id uuid
        REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    execution_context_id uuid
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    escalation_type text NOT NULL,
    from_provider_id bigint
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    from_model_or_service text,
    to_provider_id bigint
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    to_model_or_service text,
    from_value text,
    to_value text,
    reason text NOT NULL,
    authorization_request_id uuid
        REFERENCES comind.cm_foundry_authorization_request(authorization_request_id) ON DELETE RESTRICT,
    authorization_decision_id uuid
        REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    estimated_cost_delta numeric(18,8),
    actual_incremental_cost numeric(18,8),
    currency text NOT NULL DEFAULT 'USD',
    outcome text,
    source_ref text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    reconciled_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_foundry_escalation_type_ck CHECK (
        escalation_type IN (
            'model', 'provider', 'authority', 'human_review', 'capability',
            'retry_budget', 'spend_cap', 'other'
        )
    ),
    CONSTRAINT cm_foundry_escalation_reason_ck CHECK (btrim(reason) <> ''),
    CONSTRAINT cm_foundry_escalation_estimated_cost_ck CHECK (
        estimated_cost_delta IS NULL OR estimated_cost_delta >= 0
    ),
    CONSTRAINT cm_foundry_escalation_actual_cost_ck CHECK (
        actual_incremental_cost IS NULL OR actual_incremental_cost >= 0
    ),
    CONSTRAINT cm_foundry_escalation_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cm_foundry_escalation_source_ck CHECK (btrim(source_ref) <> ''),
    CONSTRAINT cm_foundry_escalation_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cm_foundry_escalation_reconciled_ck CHECK (
        reconciled_at IS NULL OR actual_incremental_cost IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS cm_foundry_escalation_project_time_idx
    ON comind.cm_foundry_escalation_event(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_task_time_idx
    ON comind.cm_foundry_escalation_event(task_id, occurred_at DESC)
    WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_foundry_escalation_type_time_idx
    ON comind.cm_foundry_escalation_event(escalation_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION comind.cm_validate_foundry_escalation_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
DECLARE
    v_context_project_id uuid;
    v_context_task_id uuid;
BEGIN
    IF NEW.execution_context_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT project_id, task_id
    INTO v_context_project_id, v_context_task_id
    FROM comind.cm_foundry_execution_context
    WHERE execution_context_id = NEW.execution_context_id;

    IF v_context_project_id IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION 'Escalation project does not match Foundry execution context project';
    END IF;
    IF NEW.task_id IS NOT NULL AND v_context_task_id IS DISTINCT FROM NEW.task_id THEN
        RAISE EXCEPTION 'Escalation task does not match Foundry execution context task';
    END IF;

    IF NEW.task_id IS NULL THEN
        NEW.task_id := v_context_task_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_foundry_escalation_validate_context
    ON comind.cm_foundry_escalation_event;
CREATE TRIGGER trg_cm_foundry_escalation_validate_context
BEFORE INSERT OR UPDATE OF project_id, task_id, execution_context_id
ON comind.cm_foundry_escalation_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_foundry_escalation_context();

-- Deliverable allocation prevents double-counting one execution at 100 percent across multiple outputs.
CREATE TABLE IF NOT EXISTS comind.cm_foundry_deliverable_cost_allocation (
    deliverable_cost_allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id uuid NOT NULL
        REFERENCES comind.cm_paid_api_execution(execution_id) ON DELETE RESTRICT,
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    task_id uuid
        REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    deliverable_ref text NOT NULL,
    deliverable_type text NOT NULL,
    source_url text,
    allocation_fraction numeric(12,10) NOT NULL,
    allocation_basis text NOT NULL,
    acceptance_status text NOT NULL DEFAULT 'draft',
    produced_at timestamptz,
    accepted_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_foundry_deliverable_ref_ck CHECK (btrim(deliverable_ref) <> ''),
    CONSTRAINT cm_foundry_deliverable_type_ck CHECK (btrim(deliverable_type) <> ''),
    CONSTRAINT cm_foundry_deliverable_fraction_ck CHECK (
        allocation_fraction > 0 AND allocation_fraction <= 1
    ),
    CONSTRAINT cm_foundry_deliverable_basis_ck CHECK (btrim(allocation_basis) <> ''),
    CONSTRAINT cm_foundry_deliverable_acceptance_ck CHECK (
        acceptance_status IN ('draft', 'in_review', 'accepted', 'rejected')
    ),
    CONSTRAINT cm_foundry_deliverable_accepted_time_ck CHECK (
        acceptance_status <> 'accepted' OR accepted_at IS NOT NULL
    ),
    CONSTRAINT cm_foundry_deliverable_execution_ref_uq UNIQUE (execution_id, deliverable_ref)
);

CREATE INDEX IF NOT EXISTS cm_foundry_deliverable_project_idx
    ON comind.cm_foundry_deliverable_cost_allocation(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_foundry_deliverable_task_idx
    ON comind.cm_foundry_deliverable_cost_allocation(task_id, created_at DESC)
    WHERE task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_validate_deliverable_cost_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
DECLARE
    v_execution_project_id uuid;
    v_execution_task_id uuid;
    v_other_fraction numeric;
BEGIN
    SELECT p.project_id, ctx.task_id
    INTO v_execution_project_id, v_execution_task_id
    FROM comind.cm_paid_api_execution AS e
    JOIN comind.cm_paid_api_access_proposal AS p ON p.proposal_id = e.proposal_id
    LEFT JOIN comind.cm_foundry_execution_context AS ctx
      ON ctx.execution_context_id = e.foundry_execution_context_id
    WHERE e.execution_id = NEW.execution_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API execution % does not exist', NEW.execution_id;
    END IF;
    IF NEW.project_id IS DISTINCT FROM v_execution_project_id THEN
        RAISE EXCEPTION 'Deliverable allocation project does not match paid API execution project';
    END IF;
    IF NEW.task_id IS NULL THEN
        NEW.task_id := v_execution_task_id;
    ELSIF v_execution_task_id IS NOT NULL AND NEW.task_id IS DISTINCT FROM v_execution_task_id THEN
        RAISE EXCEPTION 'Deliverable allocation task does not match paid API execution Foundry task';
    END IF;

    SELECT COALESCE(sum(allocation_fraction), 0)
    INTO v_other_fraction
    FROM comind.cm_foundry_deliverable_cost_allocation
    WHERE execution_id = NEW.execution_id
      AND acceptance_status <> 'rejected'
      AND deliverable_cost_allocation_id <> NEW.deliverable_cost_allocation_id;

    IF NEW.acceptance_status <> 'rejected'
       AND v_other_fraction + NEW.allocation_fraction > 1.0000000000 THEN
        RAISE EXCEPTION 'Deliverable allocation fractions for execution % exceed 1.0', NEW.execution_id;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_foundry_deliverable_validate
    ON comind.cm_foundry_deliverable_cost_allocation;
CREATE TRIGGER trg_cm_foundry_deliverable_validate
BEFORE INSERT OR UPDATE ON comind.cm_foundry_deliverable_cost_allocation
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_deliverable_cost_allocation();

CREATE OR REPLACE FUNCTION comind.cm_guard_accepted_deliverable_cost_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Deliverable cost allocations are durable attribution evidence and cannot be deleted';
    END IF;
    IF OLD.acceptance_status = 'accepted' THEN
        RAISE EXCEPTION 'Accepted deliverable cost allocation is immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_foundry_deliverable_guard
    ON comind.cm_foundry_deliverable_cost_allocation;
CREATE TRIGGER trg_cm_foundry_deliverable_guard
BEFORE UPDATE OR DELETE ON comind.cm_foundry_deliverable_cost_allocation
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_accepted_deliverable_cost_allocation();

-- Transaction register joins each internal receipt to task/outcome and any official provider invoice.
CREATE OR REPLACE VIEW comind.cm_api_cost_register_v
WITH (security_invoker = true)
AS
SELECT
    r.receipt_id,
    r.receipt_number,
    r.transaction_at,
    r.project_id,
    p.project_code,
    r.provider_id,
    r.provider_code,
    r.model_or_service,
    r.task_id,
    t.title AS task_title,
    t.status AS task_status,
    r.foundry_execution_context_id,
    o.terminal_status AS foundry_terminal_status,
    r.execution_id,
    r.proposal_id,
    r.request_count,
    r.retry_count,
    r.input_tokens,
    r.cached_input_tokens,
    r.output_tokens,
    r.reasoning_tokens,
    r.total_tokens,
    r.tool_calls,
    r.actual_cost,
    r.provider_reported_cost,
    r.currency,
    r.provider_event_id,
    i.provider_invoice_id,
    i.invoice_number AS provider_invoice_number,
    i.reconciliation_status AS provider_invoice_status,
    r.drive_sync_status,
    r.drive_register_file_id,
    r.drive_row_key,
    r.drive_synced_at,
    r.source_ref
FROM comind.cm_api_cost_receipt AS r
JOIN comind.cm_project AS p ON p.project_id = r.project_id
LEFT JOIN comind.cm_task AS t ON t.task_id = r.task_id
LEFT JOIN comind.cm_foundry_execution_outcome AS o
  ON o.execution_context_id = r.foundry_execution_context_id
LEFT JOIN comind.cm_provider_invoice_receipt_link AS l ON l.receipt_id = r.receipt_id
LEFT JOIN comind.cm_provider_invoice AS i ON i.provider_invoice_id = l.provider_invoice_id;

CREATE OR REPLACE VIEW comind.cm_foundry_task_economics_v
WITH (security_invoker = true)
AS
SELECT
    r.project_id,
    p.project_code,
    r.task_id,
    t.title AS task_title,
    t.status AS task_status,
    r.currency,
    count(*) AS paid_execution_count,
    count(DISTINCT r.foundry_execution_context_id) AS foundry_execution_count,
    bool_or(o.terminal_status = 'succeeded') AS has_succeeded_execution,
    (
        t.status = 'done'
        AND bool_or(o.terminal_status = 'succeeded')
    ) AS successful_task,
    sum(r.actual_cost) AS total_api_cost,
    CASE
        WHEN t.status = 'done' AND bool_or(o.terminal_status = 'succeeded')
            THEN sum(r.actual_cost)
        ELSE NULL
    END AS successful_task_cost,
    min(r.transaction_at) AS first_paid_execution_at,
    max(r.transaction_at) AS last_paid_execution_at,
    count(DISTINCT e.escalation_event_id) AS escalation_event_count,
    count(DISTINCT d.deliverable_ref) FILTER (WHERE d.acceptance_status <> 'rejected') AS deliverable_count
FROM comind.cm_api_cost_receipt AS r
JOIN comind.cm_project AS p ON p.project_id = r.project_id
JOIN comind.cm_task AS t ON t.task_id = r.task_id
LEFT JOIN comind.cm_foundry_execution_outcome AS o
  ON o.execution_context_id = r.foundry_execution_context_id
LEFT JOIN comind.cm_foundry_escalation_event AS e
  ON e.task_id = r.task_id AND e.project_id = r.project_id
LEFT JOIN comind.cm_foundry_deliverable_cost_allocation AS d
  ON d.task_id = r.task_id AND d.project_id = r.project_id
GROUP BY r.project_id, p.project_code, r.task_id, t.title, t.status, r.currency;

CREATE OR REPLACE VIEW comind.cm_foundry_model_economics_v
WITH (security_invoker = true)
AS
WITH base AS (
    SELECT
        r.receipt_id,
        r.project_id,
        r.provider_id,
        r.provider_code,
        r.model_or_service,
        r.currency,
        r.task_id,
        r.actual_cost,
        r.input_tokens,
        r.output_tokens,
        r.reasoning_tokens,
        r.total_tokens,
        o.terminal_status,
        t.status AS task_status
    FROM comind.cm_api_cost_receipt AS r
    LEFT JOIN comind.cm_foundry_execution_outcome AS o
      ON o.execution_context_id = r.foundry_execution_context_id
    LEFT JOIN comind.cm_task AS t ON t.task_id = r.task_id
), model_escalations AS (
    SELECT
        project_id,
        currency,
        from_provider_id,
        from_model_or_service,
        to_provider_id,
        to_model_or_service,
        count(*) FILTER (WHERE from_model_or_service IS NOT NULL) AS from_events,
        count(*) FILTER (WHERE to_model_or_service IS NOT NULL) AS to_events
    FROM comind.cm_foundry_escalation_event
    WHERE escalation_type IN ('model', 'provider')
    GROUP BY project_id, currency, from_provider_id, from_model_or_service, to_provider_id, to_model_or_service
)
SELECT
    b.project_id,
    p.project_code,
    b.provider_id,
    b.provider_code,
    b.model_or_service,
    b.currency,
    count(*) AS paid_execution_count,
    count(*) FILTER (WHERE b.terminal_status = 'succeeded') AS succeeded_execution_count,
    CASE WHEN count(*) = 0 THEN 0::numeric
         ELSE count(*) FILTER (WHERE b.terminal_status = 'succeeded')::numeric / count(*)::numeric
    END AS execution_success_rate,
    count(DISTINCT b.task_id) FILTER (
        WHERE b.task_id IS NOT NULL AND b.task_status = 'done' AND b.terminal_status = 'succeeded'
    ) AS successful_task_count,
    sum(b.actual_cost) AS total_api_cost,
    avg(b.actual_cost) AS avg_cost_per_paid_execution,
    CASE
        WHEN count(DISTINCT b.task_id) FILTER (
            WHERE b.task_id IS NOT NULL AND b.task_status = 'done' AND b.terminal_status = 'succeeded'
        ) = 0 THEN NULL
        ELSE sum(b.actual_cost) / count(DISTINCT b.task_id) FILTER (
            WHERE b.task_id IS NOT NULL AND b.task_status = 'done' AND b.terminal_status = 'succeeded'
        )
    END AS cost_per_successful_task,
    sum(b.input_tokens) AS input_tokens,
    sum(b.output_tokens) AS output_tokens,
    sum(b.reasoning_tokens) AS reasoning_tokens,
    sum(b.total_tokens) AS total_tokens,
    (
        SELECT count(*)
        FROM comind.cm_foundry_escalation_event e
        WHERE e.project_id = b.project_id
          AND e.currency = b.currency
          AND e.to_provider_id IS NOT DISTINCT FROM b.provider_id
          AND e.to_model_or_service IS NOT DISTINCT FROM b.model_or_service
          AND e.escalation_type IN ('model', 'provider')
    ) AS escalations_to_model,
    (
        SELECT count(*)
        FROM comind.cm_foundry_escalation_event e
        WHERE e.project_id = b.project_id
          AND e.currency = b.currency
          AND e.from_provider_id IS NOT DISTINCT FROM b.provider_id
          AND e.from_model_or_service IS NOT DISTINCT FROM b.model_or_service
          AND e.escalation_type IN ('model', 'provider')
    ) AS escalations_from_model
FROM base AS b
JOIN comind.cm_project AS p ON p.project_id = b.project_id
GROUP BY b.project_id, p.project_code, b.provider_id, b.provider_code, b.model_or_service, b.currency;

CREATE OR REPLACE VIEW comind.cm_foundry_deliverable_economics_v
WITH (security_invoker = true)
AS
SELECT
    d.project_id,
    p.project_code,
    d.task_id,
    d.deliverable_ref,
    d.deliverable_type,
    d.source_url,
    d.acceptance_status,
    d.allocation_basis,
    d.allocation_fraction,
    r.currency,
    r.actual_cost AS execution_actual_cost,
    (r.actual_cost * d.allocation_fraction) AS allocated_api_cost,
    d.produced_at,
    d.accepted_at,
    d.execution_id
FROM comind.cm_foundry_deliverable_cost_allocation AS d
JOIN comind.cm_api_cost_receipt AS r ON r.execution_id = d.execution_id
JOIN comind.cm_project AS p ON p.project_id = d.project_id
WHERE d.acceptance_status <> 'rejected';

CREATE OR REPLACE VIEW comind.cm_foundry_escalation_metrics_v
WITH (security_invoker = true)
AS
WITH paid AS (
    SELECT
        project_id,
        currency,
        count(*) AS paid_execution_count,
        count(DISTINCT task_id) FILTER (WHERE task_id IS NOT NULL) AS paid_task_count
    FROM comind.cm_api_cost_receipt
    GROUP BY project_id, currency
), escalated AS (
    SELECT
        project_id,
        currency,
        escalation_type,
        count(*) AS escalation_event_count,
        count(DISTINCT task_id) FILTER (WHERE task_id IS NOT NULL) AS escalated_task_count,
        sum(estimated_cost_delta) AS estimated_cost_delta,
        sum(actual_incremental_cost) AS actual_incremental_cost
    FROM comind.cm_foundry_escalation_event
    GROUP BY project_id, currency, escalation_type
)
SELECT
    e.project_id,
    p.project_code,
    e.currency,
    e.escalation_type,
    e.escalation_event_count,
    e.escalated_task_count,
    COALESCE(pd.paid_execution_count, 0) AS paid_execution_count,
    COALESCE(pd.paid_task_count, 0) AS paid_task_count,
    CASE WHEN COALESCE(pd.paid_execution_count, 0) = 0 THEN NULL
         ELSE e.escalation_event_count::numeric / pd.paid_execution_count::numeric
    END AS escalation_events_per_paid_execution,
    CASE WHEN COALESCE(pd.paid_task_count, 0) = 0 THEN NULL
         ELSE e.escalated_task_count::numeric / pd.paid_task_count::numeric
    END AS paid_task_escalation_rate,
    e.estimated_cost_delta,
    e.actual_incremental_cost
FROM escalated AS e
JOIN comind.cm_project AS p ON p.project_id = e.project_id
LEFT JOIN paid AS pd ON pd.project_id = e.project_id AND pd.currency = e.currency;

CREATE OR REPLACE VIEW comind.cm_foundry_project_unit_economics_v
WITH (security_invoker = true)
AS
WITH task_rollup AS (
    SELECT
        project_id,
        currency,
        count(*) AS paid_task_count,
        count(*) FILTER (WHERE successful_task) AS successful_task_count,
        sum(total_api_cost) AS total_api_cost
    FROM comind.cm_foundry_task_economics_v
    GROUP BY project_id, currency
), deliverable_rollup AS (
    SELECT
        project_id,
        currency,
        count(DISTINCT deliverable_ref) AS deliverable_count,
        sum(allocated_api_cost) AS allocated_deliverable_cost
    FROM comind.cm_foundry_deliverable_economics_v
    GROUP BY project_id, currency
), escalation_rollup AS (
    SELECT
        project_id,
        currency,
        count(*) AS escalation_event_count,
        count(DISTINCT task_id) FILTER (WHERE task_id IS NOT NULL) AS escalated_task_count
    FROM comind.cm_foundry_escalation_event
    GROUP BY project_id, currency
)
SELECT
    t.project_id,
    p.project_code,
    t.currency,
    t.paid_task_count,
    t.successful_task_count,
    t.total_api_cost,
    CASE WHEN t.paid_task_count = 0 THEN NULL
         ELSE t.total_api_cost / t.paid_task_count
    END AS cost_per_paid_task,
    CASE WHEN t.successful_task_count = 0 THEN NULL
         ELSE t.total_api_cost / t.successful_task_count
    END AS cost_per_successful_task,
    COALESCE(d.deliverable_count, 0) AS deliverable_count,
    COALESCE(d.allocated_deliverable_cost, 0) AS allocated_deliverable_cost,
    CASE WHEN COALESCE(d.deliverable_count, 0) = 0 THEN NULL
         ELSE d.allocated_deliverable_cost / d.deliverable_count
    END AS cost_per_deliverable,
    COALESCE(e.escalation_event_count, 0) AS escalation_event_count,
    COALESCE(e.escalated_task_count, 0) AS escalated_task_count,
    CASE WHEN t.paid_task_count = 0 THEN NULL
         ELSE COALESCE(e.escalated_task_count, 0)::numeric / t.paid_task_count::numeric
    END AS paid_task_escalation_rate
FROM task_rollup AS t
JOIN comind.cm_project AS p ON p.project_id = t.project_id
LEFT JOIN deliverable_rollup AS d
  ON d.project_id = t.project_id AND d.currency = t.currency
LEFT JOIN escalation_rollup AS e
  ON e.project_id = t.project_id AND e.currency = t.currency;

CREATE OR REPLACE VIEW comind.cm_provider_invoice_reconciliation_v
WITH (security_invoker = true)
AS
SELECT
    i.provider_invoice_id,
    i.provider_id,
    sp.provider_code,
    i.invoice_number,
    i.billing_period_start,
    i.billing_period_end,
    i.issued_at,
    i.currency,
    i.subtotal,
    i.tax_amount,
    i.total_amount,
    COALESCE(sum(l.matched_amount), 0) AS matched_transaction_cost,
    i.total_amount - COALESCE(sum(l.matched_amount), 0) AS reconciliation_delta,
    i.reconciliation_status,
    i.official_source_url,
    i.drive_archived_file_url,
    i.document_sha256
FROM comind.cm_provider_invoice AS i
JOIN public.comind_service_providers AS sp ON sp.id = i.provider_id
LEFT JOIN comind.cm_provider_invoice_receipt_link AS l
  ON l.provider_invoice_id = i.provider_invoice_id
GROUP BY
    i.provider_invoice_id, i.provider_id, sp.provider_code, i.invoice_number,
    i.billing_period_start, i.billing_period_end, i.issued_at, i.currency,
    i.subtotal, i.tax_amount, i.total_amount, i.reconciliation_status,
    i.official_source_url, i.drive_archived_file_url, i.document_sha256;

-- Any positive provider usage that cannot be tied to an internal paid execution is an exception.
CREATE OR REPLACE VIEW comind.cm_unattributed_paid_usage_v
WITH (security_invoker = true)
AS
SELECT
    ue.id AS usage_event_id,
    ue.occurred_at,
    ue.provider_id,
    sp.provider_code,
    ue.meter_code,
    ue.quantity,
    ue.measured_cost,
    btrim(ue.currency::text) AS currency,
    ue.provider_event_id,
    ue.reservation_id,
    ue.routing_decision_id,
    ue.metadata
FROM public.comind_usage_events AS ue
JOIN public.comind_service_providers AS sp ON sp.id = ue.provider_id
WHERE ue.measured_cost > 0
  AND NOT EXISTS (
      SELECT 1
      FROM comind.cm_paid_api_execution AS e
      WHERE e.reservation_id = ue.reservation_id
  );

-- Private by default. No runtime or Data API grant is introduced by this migration.
ALTER TABLE comind.cm_api_cost_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_provider_invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_provider_invoice_receipt_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_foundry_escalation_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_foundry_deliverable_cost_allocation ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE comind.cm_api_cost_receipt FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_provider_invoice FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_provider_invoice_receipt_link FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_escalation_event FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_deliverable_cost_allocation FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_api_cost_register_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_task_economics_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_model_economics_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_deliverable_economics_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_escalation_metrics_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_foundry_project_unit_economics_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_provider_invoice_reconciliation_v FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_unattributed_paid_usage_v FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE comind.cm_api_cost_receipt FROM anon;
        REVOKE ALL ON TABLE comind.cm_provider_invoice FROM anon;
        REVOKE ALL ON TABLE comind.cm_provider_invoice_receipt_link FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_escalation_event FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_deliverable_cost_allocation FROM anon;
        REVOKE ALL ON TABLE comind.cm_api_cost_register_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_task_economics_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_model_economics_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_deliverable_economics_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_escalation_metrics_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_foundry_project_unit_economics_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_provider_invoice_reconciliation_v FROM anon;
        REVOKE ALL ON TABLE comind.cm_unattributed_paid_usage_v FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE comind.cm_api_cost_receipt FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_provider_invoice FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_provider_invoice_receipt_link FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_escalation_event FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_deliverable_cost_allocation FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_api_cost_register_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_task_economics_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_model_economics_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_deliverable_economics_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_escalation_metrics_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_foundry_project_unit_economics_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_provider_invoice_reconciliation_v FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_unattributed_paid_usage_v FROM authenticated;
    END IF;
END;
$$;

COMMENT ON VIEW comind.cm_foundry_project_unit_economics_v IS
    'Project-level unit economics: total API cost, cost per task, cost per successful task, deliverable economics, and escalation rate.';
COMMENT ON VIEW comind.cm_unattributed_paid_usage_v IS
    'Positive provider usage events that cannot be attributed to a governed paid API execution and therefore require investigation.';

COMMIT;
