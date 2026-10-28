-- CINT-GOV-001: canonical project registry and paid API approval ledger
-- Issue: https://github.com/jlhogarth/CoMind/issues/274
-- Parent: https://github.com/jlhogarth/CoMind/issues/259
-- Scope: additive database contract. No paid provider execution or production activation.

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
            ('comind.cm_agent'),
            ('comind.cm_foundry_agent_profile'),
            ('comind.cm_foundry_authorization_request'),
            ('comind.cm_foundry_authorization_decision'),
            ('comind.cm_budget_authority_binding'),
            ('comind.cm_budget_authority_reservation'),
            ('comind_pm.pm_projects'),
            ('public.comind_service_providers'),
            ('public.comind_service_rate_cards'),
            ('public.comind_cost_reservations'),
            ('public.comind_routing_decisions')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-GOV-001 requires existing relations: %', v_missing;
    END IF;
END;
$$;

-- Canonical project identity is comind.cm_project. Add stable human keys and hierarchy
-- without inventing identifiers for existing legacy/test projects.
ALTER TABLE comind.cm_project
    ADD COLUMN IF NOT EXISTS project_code citext,
    ADD COLUMN IF NOT EXISTS acronym citext,
    ADD COLUMN IF NOT EXISTS parent_project_id uuid,
    ADD COLUMN IF NOT EXISTS source_system text,
    ADD COLUMN IF NOT EXISTS source_ref text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_project'::regclass
          AND conname = 'cm_project_parent_project_id_fkey'
    ) THEN
        ALTER TABLE comind.cm_project
            ADD CONSTRAINT cm_project_parent_project_id_fkey
            FOREIGN KEY (parent_project_id)
            REFERENCES comind.cm_project(project_id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_project'::regclass
          AND conname = 'cm_project_parent_not_self_ck'
    ) THEN
        ALTER TABLE comind.cm_project
            ADD CONSTRAINT cm_project_parent_not_self_ck
            CHECK (parent_project_id IS NULL OR parent_project_id <> project_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_project'::regclass
          AND conname = 'cm_project_project_code_ck'
    ) THEN
        ALTER TABLE comind.cm_project
            ADD CONSTRAINT cm_project_project_code_ck
            CHECK (
                project_code IS NULL
                OR project_code::text ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_project'::regclass
          AND conname = 'cm_project_acronym_ck'
    ) THEN
        ALTER TABLE comind.cm_project
            ADD CONSTRAINT cm_project_acronym_ck
            CHECK (
                acronym IS NULL
                OR acronym::text ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$'
            );
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cm_project_project_code_uq
    ON comind.cm_project(project_code)
    WHERE project_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cm_project_acronym_uq
    ON comind.cm_project(acronym)
    WHERE acronym IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_project_parent_project_id_idx
    ON comind.cm_project(parent_project_id)
    WHERE parent_project_id IS NOT NULL;

COMMENT ON COLUMN comind.cm_project.project_code IS
    'Stable human-readable canonical project key for cross-system foreign-key and link resolution.';
COMMENT ON COLUMN comind.cm_project.acronym IS
    'Human-facing project acronym. Nullable for legacy/test projects whose acronym has not been authoritatively established.';
COMMENT ON COLUMN comind.cm_project.parent_project_id IS
    'Optional canonical project hierarchy. Deletion is restricted so child provenance cannot be orphaned silently.';
COMMENT ON COLUMN comind.cm_project.source_system IS
    'System that authoritatively established the project identity, when known.';
COMMENT ON COLUMN comind.cm_project.source_ref IS
    'Durable source reference that established the project identity, when known.';

DO $$
DECLARE
    v_root_count integer;
    v_root_code text;
    v_root_acronym text;
BEGIN
    SELECT count(*) INTO v_root_count
    FROM comind.cm_project
    WHERE slug = 'comind'::citext
      AND title = 'CoMind';

    IF v_root_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one existing canonical CoMind project, found %', v_root_count;
    END IF;

    SELECT project_code::text, acronym::text
    INTO v_root_code, v_root_acronym
    FROM comind.cm_project
    WHERE slug = 'comind'::citext
      AND title = 'CoMind';

    IF v_root_code IS NOT NULL AND v_root_code <> 'COMIND' THEN
        RAISE EXCEPTION 'Existing CoMind project_code conflicts with COMIND: %', v_root_code;
    END IF;
    IF v_root_acronym IS NOT NULL AND v_root_acronym <> 'COMIND' THEN
        RAISE EXCEPTION 'Existing CoMind acronym conflicts with COMIND: %', v_root_acronym;
    END IF;
END;
$$;

UPDATE comind.cm_project
SET project_code = COALESCE(project_code, 'COMIND'::citext),
    acronym = COALESCE(acronym, 'COMIND'::citext),
    source_system = COALESCE(source_system, 'github'),
    source_ref = COALESCE(source_ref, 'github:repo:jlhogarth/CoMind'),
    updated_at = now()
WHERE slug = 'comind'::citext
  AND title = 'CoMind'
  AND (
      project_code IS NULL
      OR acronym IS NULL
      OR source_system IS NULL
      OR source_ref IS NULL
  );

DO $$
DECLARE
    v_conflict_count integer;
BEGIN
    SELECT count(*) INTO v_conflict_count
    FROM comind.cm_project
    WHERE slug = 'competitive-intelligence'::citext
      AND (project_code IS NULL OR project_code <> 'CINT'::citext);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'Existing competitive-intelligence slug conflicts with canonical CINT identity';
    END IF;
END;
$$;

INSERT INTO comind.cm_project (
    org_id,
    title,
    slug,
    description,
    status,
    meta,
    project_code,
    acronym,
    parent_project_id,
    source_system,
    source_ref
)
SELECT
    root.org_id,
    'Competitive Intelligence',
    'competitive-intelligence'::citext,
    'CoMind Competitive Intelligence function for competitive landscape, reuse and adoption opportunities, comparative proofs, customer value, economics and usability, and defensibility.',
    'active',
    jsonb_build_object(
        'governance_contract', 'CINT-OPS-001',
        'github_issue', 259
    ),
    'CINT'::citext,
    'CINT'::citext,
    root.project_id,
    'github',
    'github:issue:259'
FROM comind.cm_project AS root
WHERE root.project_code = 'COMIND'::citext
  AND NOT EXISTS (
      SELECT 1 FROM comind.cm_project WHERE project_code = 'CINT'::citext
  );

-- Bridge the PM ledger to canonical project identity. Existing PM semantics remain unchanged.
ALTER TABLE comind_pm.pm_projects
    ADD COLUMN IF NOT EXISTS canonical_project_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind_pm.pm_projects'::regclass
          AND conname = 'pm_projects_canonical_project_id_fkey'
    ) THEN
        ALTER TABLE comind_pm.pm_projects
            ADD CONSTRAINT pm_projects_canonical_project_id_fkey
            FOREIGN KEY (canonical_project_id)
            REFERENCES comind.cm_project(project_id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS pm_projects_canonical_project_id_idx
    ON comind_pm.pm_projects(canonical_project_id)
    WHERE canonical_project_id IS NOT NULL;

DO $$
DECLARE
    v_existing uuid;
    v_canonical uuid;
BEGIN
    SELECT project_id INTO v_canonical
    FROM comind.cm_project
    WHERE project_code = 'COMIND'::citext;

    SELECT canonical_project_id INTO v_existing
    FROM comind_pm.pm_projects
    WHERE project_key = 'COMIND';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expected existing COMIND PM project';
    END IF;

    IF v_existing IS NOT NULL AND v_existing <> v_canonical THEN
        RAISE EXCEPTION 'COMIND PM project is already linked to a different canonical project';
    END IF;
END;
$$;

UPDATE comind_pm.pm_projects AS p
SET canonical_project_id = c.project_id,
    updated_at = now()
FROM comind.cm_project AS c
WHERE p.project_key = 'COMIND'
  AND c.project_code = 'COMIND'::citext
  AND p.canonical_project_id IS NULL;

COMMENT ON COLUMN comind_pm.pm_projects.canonical_project_id IS
    'Optional bridge to canonical comind.cm_project identity. PM project state remains owned by comind_pm.';

-- Canonical project links avoid forcing non-PM consumers through comind_pm.pm_links.
CREATE TABLE IF NOT EXISTS comind.cm_project_link (
    project_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    link_type text NOT NULL,
    system text NOT NULL,
    title text,
    url text,
    external_id text,
    is_canonical boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_project_link_type_ck CHECK (btrim(link_type) <> ''),
    CONSTRAINT cm_project_link_system_ck CHECK (btrim(system) <> ''),
    CONSTRAINT cm_project_link_locator_ck CHECK (url IS NOT NULL OR external_id IS NOT NULL),
    CONSTRAINT cm_project_link_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_project_link_url_uq
    ON comind.cm_project_link(project_id, system, url)
    WHERE url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cm_project_link_external_id_uq
    ON comind.cm_project_link(project_id, system, external_id)
    WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_project_link_project_idx
    ON comind.cm_project_link(project_id, created_at DESC);

INSERT INTO comind.cm_project_link (
    project_id, link_type, system, title, url, external_id, is_canonical, metadata
)
SELECT
    p.project_id,
    'repository',
    'github',
    'CoMind GitHub repository',
    'https://github.com/jlhogarth/CoMind',
    'jlhogarth/CoMind',
    true,
    '{}'::jsonb
FROM comind.cm_project AS p
WHERE p.project_code = 'COMIND'::citext
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_project_link (
    project_id, link_type, system, title, url, external_id, is_canonical, metadata
)
SELECT
    p.project_id,
    'operating_contract',
    'github',
    'CINT-OPS-001 competitive intelligence operating contract',
    'https://github.com/jlhogarth/CoMind/issues/259',
    'issue:259',
    true,
    jsonb_build_object('contract', 'CINT-OPS-001')
FROM comind.cm_project AS p
WHERE p.project_code = 'CINT'::citext
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_project_link (
    project_id, link_type, system, title, url, external_id, is_canonical, metadata
)
SELECT
    p.project_id,
    'governance_implementation',
    'github',
    'CINT-GOV-001 project registry and paid API approval ledger',
    'https://github.com/jlhogarth/CoMind/issues/274',
    'issue:274',
    false,
    jsonb_build_object('contract', 'CINT-GOV-001')
FROM comind.cm_project AS p
WHERE p.project_code = 'CINT'::citext
ON CONFLICT DO NOTHING;

-- Proposal is the human-reviewable approval scope. It does not itself reserve budget.
CREATE TABLE IF NOT EXISTS comind.cm_paid_api_access_proposal (
    proposal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    requesting_agent_id uuid
        REFERENCES comind.cm_agent(agent_id) ON DELETE RESTRICT,
    requesting_profile_id uuid
        REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    purpose text NOT NULL,
    expected_benefit text NOT NULL,
    success_criteria jsonb NOT NULL,
    provider_id bigint NOT NULL
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    model_or_service text NOT NULL,
    rate_card_id bigint
        REFERENCES public.comind_service_rate_cards(id) ON DELETE RESTRICT,
    pricing_source_url text NOT NULL,
    pricing_source_version text,
    pricing_verified_at timestamptz NOT NULL,
    pricing_snapshot jsonb NOT NULL,
    expected_cost numeric(18,8) NOT NULL,
    max_spend numeric(18,8) NOT NULL,
    currency text NOT NULL DEFAULT 'USD',
    max_requests integer NOT NULL,
    max_input_tokens bigint,
    max_output_tokens bigint,
    max_total_tokens bigint,
    max_tool_calls integer,
    max_retries integer NOT NULL DEFAULT 0,
    stop_conditions jsonb NOT NULL,
    proposal_status text NOT NULL DEFAULT 'draft',
    authorization_request_id uuid
        REFERENCES comind.cm_foundry_authorization_request(authorization_request_id) ON DELETE RESTRICT,
    authorization_decision_id uuid
        REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    approval_source_system text,
    approval_source_ref text,
    approved_at timestamptz,
    approval_expires_at timestamptz,
    supersedes_proposal_id uuid
        REFERENCES comind.cm_paid_api_access_proposal(proposal_id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_paid_api_access_proposal_purpose_ck CHECK (btrim(purpose) <> ''),
    CONSTRAINT cm_paid_api_access_proposal_benefit_ck CHECK (btrim(expected_benefit) <> ''),
    CONSTRAINT cm_paid_api_access_proposal_success_ck CHECK (
        jsonb_typeof(success_criteria) = 'array' AND jsonb_array_length(success_criteria) > 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_model_ck CHECK (btrim(model_or_service) <> ''),
    CONSTRAINT cm_paid_api_access_proposal_pricing_url_ck CHECK (btrim(pricing_source_url) <> ''),
    CONSTRAINT cm_paid_api_access_proposal_pricing_snapshot_ck CHECK (
        jsonb_typeof(pricing_snapshot) = 'object' AND pricing_snapshot <> '{}'::jsonb
    ),
    CONSTRAINT cm_paid_api_access_proposal_cost_ck CHECK (
        expected_cost >= 0 AND max_spend >= expected_cost
    ),
    CONSTRAINT cm_paid_api_access_proposal_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cm_paid_api_access_proposal_request_ck CHECK (max_requests > 0),
    CONSTRAINT cm_paid_api_access_proposal_input_tokens_ck CHECK (
        max_input_tokens IS NULL OR max_input_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_output_tokens_ck CHECK (
        max_output_tokens IS NULL OR max_output_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_total_tokens_ck CHECK (
        max_total_tokens IS NULL OR max_total_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_tool_calls_ck CHECK (
        max_tool_calls IS NULL OR max_tool_calls >= 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_retries_ck CHECK (max_retries >= 0),
    CONSTRAINT cm_paid_api_access_proposal_stop_ck CHECK (
        jsonb_typeof(stop_conditions) = 'array' AND jsonb_array_length(stop_conditions) > 0
    ),
    CONSTRAINT cm_paid_api_access_proposal_status_ck CHECK (
        proposal_status IN (
            'draft', 'pending_approval', 'approved', 'rejected',
            'cancelled', 'expired', 'superseded', 'completed'
        )
    ),
    CONSTRAINT cm_paid_api_access_proposal_approval_ck CHECK (
        proposal_status <> 'approved'
        OR (
            approved_at IS NOT NULL
            AND approval_source_system IS NOT NULL
            AND approval_source_ref IS NOT NULL
        )
    ),
    CONSTRAINT cm_paid_api_access_proposal_approval_expiry_ck CHECK (
        approval_expires_at IS NULL
        OR (approved_at IS NOT NULL AND approval_expires_at > approved_at)
    ),
    CONSTRAINT cm_paid_api_access_proposal_supersession_ck CHECK (
        supersedes_proposal_id IS NULL OR supersedes_proposal_id <> proposal_id
    )
);

CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_project_status_idx
    ON comind.cm_paid_api_access_proposal(project_id, proposal_status, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_provider_idx
    ON comind.cm_paid_api_access_proposal(provider_id, model_or_service, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_paid_api_access_proposal_supersedes_idx
    ON comind.cm_paid_api_access_proposal(supersedes_proposal_id)
    WHERE supersedes_proposal_id IS NOT NULL;

COMMENT ON TABLE comind.cm_paid_api_access_proposal IS
    'Founder-reviewable scope for one bounded paid API experiment. Approval does not replace budget reservation or runtime authority.';
COMMENT ON COLUMN comind.cm_paid_api_access_proposal.pricing_snapshot IS
    'Immutable provider/model pricing facts presented for approval, captured with source and verification time.';
COMMENT ON COLUMN comind.cm_paid_api_access_proposal.max_spend IS
    'Maximum experiment spend approved by the human authority. Runtime must also enforce an existing cost envelope/reservation.';

CREATE OR REPLACE FUNCTION comind.cm_guard_paid_api_access_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
    IF OLD.proposal_status IN ('rejected', 'cancelled', 'expired', 'superseded', 'completed')
       AND NEW.proposal_status <> OLD.proposal_status THEN
        RAISE EXCEPTION 'Terminal paid API proposal status % is immutable', OLD.proposal_status;
    END IF;

    IF OLD.proposal_status = 'approved'
       AND NEW.proposal_status NOT IN ('approved', 'completed', 'cancelled', 'expired', 'superseded') THEN
        RAISE EXCEPTION 'Approved paid API proposal cannot return to pre-approval status';
    END IF;

    IF OLD.proposal_status IN ('approved', 'cancelled', 'expired', 'superseded', 'completed') AND (
        OLD.project_id IS DISTINCT FROM NEW.project_id
        OR OLD.requesting_agent_id IS DISTINCT FROM NEW.requesting_agent_id
        OR OLD.requesting_profile_id IS DISTINCT FROM NEW.requesting_profile_id
        OR OLD.purpose IS DISTINCT FROM NEW.purpose
        OR OLD.expected_benefit IS DISTINCT FROM NEW.expected_benefit
        OR OLD.success_criteria IS DISTINCT FROM NEW.success_criteria
        OR OLD.provider_id IS DISTINCT FROM NEW.provider_id
        OR OLD.model_or_service IS DISTINCT FROM NEW.model_or_service
        OR OLD.rate_card_id IS DISTINCT FROM NEW.rate_card_id
        OR OLD.pricing_source_url IS DISTINCT FROM NEW.pricing_source_url
        OR OLD.pricing_source_version IS DISTINCT FROM NEW.pricing_source_version
        OR OLD.pricing_verified_at IS DISTINCT FROM NEW.pricing_verified_at
        OR OLD.pricing_snapshot IS DISTINCT FROM NEW.pricing_snapshot
        OR OLD.expected_cost IS DISTINCT FROM NEW.expected_cost
        OR OLD.max_spend IS DISTINCT FROM NEW.max_spend
        OR OLD.currency IS DISTINCT FROM NEW.currency
        OR OLD.max_requests IS DISTINCT FROM NEW.max_requests
        OR OLD.max_input_tokens IS DISTINCT FROM NEW.max_input_tokens
        OR OLD.max_output_tokens IS DISTINCT FROM NEW.max_output_tokens
        OR OLD.max_total_tokens IS DISTINCT FROM NEW.max_total_tokens
        OR OLD.max_tool_calls IS DISTINCT FROM NEW.max_tool_calls
        OR OLD.max_retries IS DISTINCT FROM NEW.max_retries
        OR OLD.stop_conditions IS DISTINCT FROM NEW.stop_conditions
        OR OLD.authorization_request_id IS DISTINCT FROM NEW.authorization_request_id
        OR OLD.authorization_decision_id IS DISTINCT FROM NEW.authorization_decision_id
        OR OLD.approval_source_system IS DISTINCT FROM NEW.approval_source_system
        OR OLD.approval_source_ref IS DISTINCT FROM NEW.approval_source_ref
        OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
        OR OLD.approval_expires_at IS DISTINCT FROM NEW.approval_expires_at
        OR OLD.supersedes_proposal_id IS DISTINCT FROM NEW.supersedes_proposal_id
    ) THEN
        RAISE EXCEPTION 'Approved paid API proposal scope is immutable; create a superseding proposal and obtain fresh approval';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_access_proposal_guard
    ON comind.cm_paid_api_access_proposal;
CREATE TRIGGER trg_cm_paid_api_access_proposal_guard
BEFORE UPDATE ON comind.cm_paid_api_access_proposal
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_paid_api_access_proposal();

-- Execution receipt requires the existing budget-authority binding and reservation.
-- Actuals remain nullable until measured/reconciled. Over-cap truth is stored and flagged by the analysis view.
CREATE TABLE IF NOT EXISTS comind.cm_paid_api_execution (
    execution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL
        REFERENCES comind.cm_paid_api_access_proposal(proposal_id) ON DELETE RESTRICT,
    binding_id uuid NOT NULL
        REFERENCES comind.cm_budget_authority_binding(binding_id) ON DELETE RESTRICT,
    reservation_id bigint NOT NULL
        REFERENCES public.comind_cost_reservations(id) ON DELETE RESTRICT,
    routing_decision_id bigint
        REFERENCES public.comind_routing_decisions(id) ON DELETE RESTRICT,
    attempt_number integer NOT NULL DEFAULT 1,
    provider_event_id text,
    execution_status text NOT NULL DEFAULT 'authorized',
    requests_made integer NOT NULL DEFAULT 0,
    retries_used integer NOT NULL DEFAULT 0,
    actual_input_tokens bigint,
    actual_cached_input_tokens bigint,
    actual_output_tokens bigint,
    actual_reasoning_tokens bigint,
    actual_total_tokens bigint,
    actual_expense numeric(18,8),
    provider_reported_expense numeric(18,8),
    currency text NOT NULL DEFAULT 'USD',
    failure_code text,
    failure_report text,
    started_at timestamptz,
    completed_at timestamptz,
    reconciled_at timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_paid_api_execution_attempt_ck CHECK (attempt_number > 0),
    CONSTRAINT cm_paid_api_execution_status_ck CHECK (
        execution_status IN ('authorized', 'running', 'completed', 'failed', 'cancelled', 'reconciled')
    ),
    CONSTRAINT cm_paid_api_execution_requests_ck CHECK (requests_made >= 0),
    CONSTRAINT cm_paid_api_execution_retries_ck CHECK (retries_used >= 0),
    CONSTRAINT cm_paid_api_execution_input_tokens_ck CHECK (
        actual_input_tokens IS NULL OR actual_input_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_execution_cached_tokens_ck CHECK (
        actual_cached_input_tokens IS NULL OR actual_cached_input_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_execution_output_tokens_ck CHECK (
        actual_output_tokens IS NULL OR actual_output_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_execution_reasoning_tokens_ck CHECK (
        actual_reasoning_tokens IS NULL OR actual_reasoning_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_execution_total_tokens_ck CHECK (
        actual_total_tokens IS NULL OR actual_total_tokens >= 0
    ),
    CONSTRAINT cm_paid_api_execution_expense_ck CHECK (
        actual_expense IS NULL OR actual_expense >= 0
    ),
    CONSTRAINT cm_paid_api_execution_provider_expense_ck CHECK (
        provider_reported_expense IS NULL OR provider_reported_expense >= 0
    ),
    CONSTRAINT cm_paid_api_execution_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT cm_paid_api_execution_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cm_paid_api_execution_terminal_time_ck CHECK (
        execution_status NOT IN ('completed', 'failed', 'cancelled', 'reconciled')
        OR completed_at IS NOT NULL
    ),
    CONSTRAINT cm_paid_api_execution_proposal_attempt_uq UNIQUE (proposal_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS cm_paid_api_execution_proposal_status_idx
    ON comind.cm_paid_api_execution(proposal_id, execution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_paid_api_execution_binding_idx
    ON comind.cm_paid_api_execution(binding_id);
CREATE INDEX IF NOT EXISTS cm_paid_api_execution_reservation_idx
    ON comind.cm_paid_api_execution(reservation_id);

CREATE OR REPLACE FUNCTION comind.cm_validate_paid_api_execution_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_proposal_project_id uuid;
    v_proposal_agent_id uuid;
    v_proposal_provider_id bigint;
    v_proposal_currency text;
    v_proposal_status text;
    v_approval_expires_at timestamptz;
    v_binding_project_id uuid;
    v_binding_agent_id uuid;
    v_binding_envelope_id bigint;
    v_reservation_provider_id bigint;
    v_routing_envelope_id bigint;
    v_routing_provider_id bigint;
BEGIN
    SELECT
        project_id,
        requesting_agent_id,
        provider_id,
        currency,
        proposal_status,
        approval_expires_at
    INTO
        v_proposal_project_id,
        v_proposal_agent_id,
        v_proposal_provider_id,
        v_proposal_currency,
        v_proposal_status,
        v_approval_expires_at
    FROM comind.cm_paid_api_access_proposal
    WHERE proposal_id = NEW.proposal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API proposal % does not exist', NEW.proposal_id;
    END IF;
    IF v_proposal_status <> 'approved' THEN
        RAISE EXCEPTION 'Paid API execution requires approved proposal; current status is %', v_proposal_status;
    END IF;
    IF v_approval_expires_at IS NOT NULL AND v_approval_expires_at <= now() THEN
        RAISE EXCEPTION 'Paid API proposal approval has expired';
    END IF;
    IF NEW.currency <> v_proposal_currency THEN
        RAISE EXCEPTION 'Execution currency % conflicts with proposal currency %', NEW.currency, v_proposal_currency;
    END IF;

    SELECT project_id, agent_id, envelope_id
    INTO v_binding_project_id, v_binding_agent_id, v_binding_envelope_id
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = NEW.binding_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Budget authority binding % does not exist', NEW.binding_id;
    END IF;
    IF v_binding_project_id IS NULL OR v_binding_project_id <> v_proposal_project_id THEN
        RAISE EXCEPTION 'Budget authority binding project does not match paid API proposal project';
    END IF;
    IF v_proposal_agent_id IS NOT NULL
       AND v_binding_agent_id IS NOT NULL
       AND v_binding_agent_id <> v_proposal_agent_id THEN
        RAISE EXCEPTION 'Budget authority binding agent conflicts with paid API proposal agent';
    END IF;

    SELECT r.provider_id
    INTO v_reservation_provider_id
    FROM public.comind_cost_reservations AS r
    JOIN comind.cm_budget_authority_reservation AS ar
      ON ar.reservation_id = r.id
    WHERE r.id = NEW.reservation_id
      AND ar.binding_id = NEW.binding_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % is not linked to budget binding %', NEW.reservation_id, NEW.binding_id;
    END IF;
    IF v_reservation_provider_id <> v_proposal_provider_id THEN
        RAISE EXCEPTION 'Reservation provider does not match paid API proposal provider';
    END IF;

    IF NEW.routing_decision_id IS NOT NULL THEN
        SELECT envelope_id, selected_provider_id
        INTO v_routing_envelope_id, v_routing_provider_id
        FROM public.comind_routing_decisions
        WHERE id = NEW.routing_decision_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Routing decision % does not exist', NEW.routing_decision_id;
        END IF;
        IF v_routing_envelope_id <> v_binding_envelope_id THEN
            RAISE EXCEPTION 'Routing decision envelope does not match budget binding envelope';
        END IF;
        IF v_routing_provider_id IS DISTINCT FROM v_proposal_provider_id THEN
            RAISE EXCEPTION 'Routing decision provider does not match paid API proposal provider';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_validate_insert
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_validate_insert
BEFORE INSERT ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_paid_api_execution_insert();

CREATE OR REPLACE FUNCTION comind.cm_cint_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_updated_at
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_updated_at
BEFORE UPDATE ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_cint_set_updated_at();

-- Versionable operating policy. Agent/profile binding stays nullable until role-directory reconciliation is accepted.
CREATE TABLE IF NOT EXISTS comind.cm_agent_operating_policy (
    operating_policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key text NOT NULL UNIQUE,
    policy_version text NOT NULL,
    project_id uuid NOT NULL
        REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    agent_id uuid
        REFERENCES comind.cm_agent(agent_id) ON DELETE RESTRICT,
    profile_id uuid
        REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    assignment_name text NOT NULL,
    purpose text NOT NULL,
    authority_floor text NOT NULL DEFAULT 'C0',
    authority_ceiling text NOT NULL DEFAULT 'C1',
    authority_limits jsonb NOT NULL,
    source_capture_policy jsonb NOT NULL,
    independent_review_required boolean NOT NULL DEFAULT true,
    independent_review_policy jsonb NOT NULL,
    failure_reporting_policy jsonb NOT NULL,
    acceptance_stage text NOT NULL,
    acceptance_status text NOT NULL DEFAULT 'not_accepted',
    acceptance_evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
    ongoing_operation_allowed boolean NOT NULL DEFAULT false,
    binding_status text NOT NULL DEFAULT 'unbound',
    contract_source_system text NOT NULL,
    contract_source_ref text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_agent_operating_policy_key_ck CHECK (
        policy_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
    CONSTRAINT cm_agent_operating_policy_version_ck CHECK (btrim(policy_version) <> ''),
    CONSTRAINT cm_agent_operating_policy_assignment_ck CHECK (btrim(assignment_name) <> ''),
    CONSTRAINT cm_agent_operating_policy_purpose_ck CHECK (btrim(purpose) <> ''),
    CONSTRAINT cm_agent_operating_policy_authority_ck CHECK (
        authority_floor IN ('C0', 'C1', 'C2', 'C3', 'C4')
        AND authority_ceiling IN ('C0', 'C1', 'C2', 'C3', 'C4')
        AND substring(authority_floor FROM 2)::integer <= substring(authority_ceiling FROM 2)::integer
    ),
    CONSTRAINT cm_agent_operating_policy_authority_limits_ck CHECK (jsonb_typeof(authority_limits) = 'object'),
    CONSTRAINT cm_agent_operating_policy_source_capture_ck CHECK (jsonb_typeof(source_capture_policy) = 'object'),
    CONSTRAINT cm_agent_operating_policy_review_ck CHECK (jsonb_typeof(independent_review_policy) = 'object'),
    CONSTRAINT cm_agent_operating_policy_failure_ck CHECK (jsonb_typeof(failure_reporting_policy) = 'object'),
    CONSTRAINT cm_agent_operating_policy_stage_ck CHECK (
        acceptance_stage IN ('bounded_analyst', 'shadow_department_head', 'supervised_ongoing')
    ),
    CONSTRAINT cm_agent_operating_policy_acceptance_ck CHECK (
        acceptance_status IN ('not_accepted', 'in_review', 'accepted', 'rejected', 'retired')
    ),
    CONSTRAINT cm_agent_operating_policy_evidence_ck CHECK (jsonb_typeof(acceptance_evidence_refs) = 'array'),
    CONSTRAINT cm_agent_operating_policy_binding_ck CHECK (
        binding_status IN ('unbound', 'bound', 'retired')
        AND (binding_status <> 'bound' OR agent_id IS NOT NULL)
    ),
    CONSTRAINT cm_agent_operating_policy_ongoing_ck CHECK (
        NOT ongoing_operation_allowed
        OR (acceptance_stage = 'supervised_ongoing' AND acceptance_status = 'accepted')
    ),
    CONSTRAINT cm_agent_operating_policy_effective_ck CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT cm_agent_operating_policy_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS cm_agent_operating_policy_project_idx
    ON comind.cm_agent_operating_policy(project_id, acceptance_stage, acceptance_status);
CREATE INDEX IF NOT EXISTS cm_agent_operating_policy_agent_idx
    ON comind.cm_agent_operating_policy(agent_id)
    WHERE agent_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_cm_agent_operating_policy_updated_at
    ON comind.cm_agent_operating_policy;
CREATE TRIGGER trg_cm_agent_operating_policy_updated_at
BEFORE UPDATE ON comind.cm_agent_operating_policy
FOR EACH ROW EXECUTE FUNCTION comind.cm_cint_set_updated_at();

INSERT INTO comind.cm_agent_operating_policy (
    policy_key,
    policy_version,
    project_id,
    agent_id,
    profile_id,
    assignment_name,
    purpose,
    authority_floor,
    authority_ceiling,
    authority_limits,
    source_capture_policy,
    independent_review_required,
    independent_review_policy,
    failure_reporting_policy,
    acceptance_stage,
    acceptance_status,
    acceptance_evidence_refs,
    ongoing_operation_allowed,
    binding_status,
    contract_source_system,
    contract_source_ref,
    metadata
)
SELECT
    'CINT-OPS-001',
    '0.2',
    p.project_id,
    NULL,
    NULL,
    'Competitive Intelligence department operating policy',
    'Help Joseph decide what to build, adopt, prove, defer, and retire through bounded competitive intelligence and evidence-backed recommendations.',
    'C0',
    'C2',
    jsonb_build_object(
        'research_reads', 'T0 when non-sensitive and authorized',
        'bounded_metadata_writes', 'T2 only under explicit scoped founder authorization',
        'isolated_implementation', 'T1 in a separate reviewable lane',
        'separate_authorization_required', jsonb_build_array(
            'paid_api_execution',
            'purchases',
            'external_outreach',
            'production_or_security_change',
            'runtime_activation',
            'cross_agent_write',
            'other_lane_mutation'
        ),
        'forbidden', jsonb_build_array(
            'self_approve_strategy',
            'self_elevate_authority',
            'silently_alter_other_lane'
        )
    ),
    jsonb_build_object(
        'capture_before_synthesis', true,
        'required_fields', jsonb_build_array(
            'canonical_url',
            'publisher_or_authors',
            'publication_date',
            'access_date',
            'inspected_version',
            'source_type',
            'claim_supported',
            'limitations',
            'access_status',
            'content_hash_when_available'
        ),
        'unavailable_fields', 'record_explicitly',
        'abstract_only', 'must_not_imply_full_text_inspection',
        'restricted_material', 'do_not_copy_wholesale'
    ),
    true,
    jsonb_build_object(
        'reviewer_must_be_independent', true,
        'permitted_reviewers', jsonb_build_array('Joseph Hogarth', 'separately_authorized_reviewer'),
        'researcher_may_self_approve', false,
        'evidence_availability_must_be_recorded', true
    ),
    jsonb_build_object(
        'run_states', jsonb_build_array('queued', 'running', 'completed', 'partial', 'blocked', 'failed'),
        'terminal_receipt_required', true,
        'failure_reason_required', true,
        'recovery_owner_required', true,
        'restart_condition_required', true,
        'persistence_failure', 'do_not_report_sync_or_advance_checkpoint'
    ),
    'bounded_analyst',
    'not_accepted',
    jsonb_build_array('github:issue:259'),
    false,
    'unbound',
    'github',
    'github:issue:259',
    jsonb_build_object(
        'role_identity_status', 'unresolved',
        'synthetic_proof_agent_reuse', false,
        'stages', jsonb_build_array(
            'A bounded analyst',
            'B department head in shadow mode',
            'C supervised ongoing operation'
        )
    )
FROM comind.cm_project AS p
WHERE p.project_code = 'CINT'::citext
ON CONFLICT (policy_key) DO NOTHING;

COMMENT ON TABLE comind.cm_agent_operating_policy IS
    'Versionable project/agent operating policy. An unbound policy defines governance without creating or activating an agent identity.';

-- Private analysis projection. Security invoker preserves the caller's underlying privileges.
CREATE OR REPLACE VIEW comind.cm_paid_api_access_analysis_v
WITH (security_invoker = true)
AS
SELECT
    p.proposal_id,
    p.project_id,
    pr.project_code,
    pr.title AS project_title,
    p.proposal_status,
    p.purpose,
    p.expected_benefit,
    sp.provider_code,
    sp.provider_name,
    p.model_or_service,
    p.pricing_source_url,
    p.pricing_source_version,
    p.pricing_verified_at,
    p.expected_cost,
    p.max_spend,
    p.currency AS proposal_currency,
    p.max_requests,
    p.max_input_tokens,
    p.max_output_tokens,
    p.max_total_tokens,
    p.max_tool_calls,
    p.max_retries,
    p.approved_at,
    p.approval_expires_at,
    (
        p.proposal_status = 'approved'
        AND (p.approval_expires_at IS NULL OR p.approval_expires_at > now())
    ) AS approval_current,
    e.execution_id,
    e.attempt_number,
    e.execution_status,
    e.requests_made,
    e.retries_used,
    e.actual_input_tokens,
    e.actual_cached_input_tokens,
    e.actual_output_tokens,
    e.actual_reasoning_tokens,
    e.actual_total_tokens,
    e.actual_expense,
    e.provider_reported_expense,
    e.currency AS execution_currency,
    CASE
        WHEN e.actual_expense IS NULL THEN NULL
        ELSE e.actual_expense - p.expected_cost
    END AS expense_vs_estimate,
    CASE
        WHEN e.actual_expense IS NULL THEN NULL
        ELSE p.max_spend - e.actual_expense
    END AS spend_remaining,
    CASE
        WHEN e.actual_expense IS NULL THEN false
        ELSE e.actual_expense > p.max_spend
    END AS spend_cap_breached,
    CASE
        WHEN e.execution_id IS NULL THEN false
        ELSE e.requests_made > p.max_requests
    END AS request_cap_breached,
    CASE
        WHEN e.execution_id IS NULL THEN false
        ELSE e.retries_used > p.max_retries
    END AS retry_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_input_tokens IS NULL OR e.actual_input_tokens IS NULL THEN false
        ELSE e.actual_input_tokens > p.max_input_tokens
    END AS input_token_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_output_tokens IS NULL OR e.actual_output_tokens IS NULL THEN false
        ELSE e.actual_output_tokens > p.max_output_tokens
    END AS output_token_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_total_tokens IS NULL OR e.actual_total_tokens IS NULL THEN false
        ELSE e.actual_total_tokens > p.max_total_tokens
    END AS total_token_cap_breached,
    e.failure_code,
    e.failure_report,
    e.started_at,
    e.completed_at,
    e.reconciled_at
FROM comind.cm_paid_api_access_proposal AS p
JOIN comind.cm_project AS pr
  ON pr.project_id = p.project_id
JOIN public.comind_service_providers AS sp
  ON sp.id = p.provider_id
LEFT JOIN comind.cm_paid_api_execution AS e
  ON e.proposal_id = p.proposal_id;

-- New private governance tables are fail-closed by default. No runtime grants are added here.
ALTER TABLE comind.cm_project_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_paid_api_access_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_paid_api_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_agent_operating_policy ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE comind.cm_project_link FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_paid_api_access_proposal FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_paid_api_execution FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_agent_operating_policy FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_paid_api_access_analysis_v FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE comind.cm_project_link FROM anon;
        REVOKE ALL ON TABLE comind.cm_paid_api_access_proposal FROM anon;
        REVOKE ALL ON TABLE comind.cm_paid_api_execution FROM anon;
        REVOKE ALL ON TABLE comind.cm_agent_operating_policy FROM anon;
        REVOKE ALL ON TABLE comind.cm_paid_api_access_analysis_v FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE comind.cm_project_link FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_paid_api_access_proposal FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_paid_api_execution FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_agent_operating_policy FROM authenticated;
        REVOKE ALL ON TABLE comind.cm_paid_api_access_analysis_v FROM authenticated;
    END IF;
END;
$$;

COMMENT ON VIEW comind.cm_paid_api_access_analysis_v IS
    'Private estimate-versus-actual analysis projection. Cap breach flags preserve observed truth without suppressing over-limit receipts.';

COMMIT;
