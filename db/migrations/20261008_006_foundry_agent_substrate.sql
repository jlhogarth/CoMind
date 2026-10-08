-- CoMind Foundry agent substrate
-- Version: 1.0.0
-- Date: 2026-10-08
-- Purpose: Add real governed Agent and Virtual Employee support tables for isolated PostgreSQL verification.
-- Scope: Database contract only. No live Supabase deployment, provider calls, or autonomous runtime execution.

BEGIN;

DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_org'),
            ('comind.cm_actor'),
            ('comind.cm_project'),
            ('comind.cm_agent'),
            ('comind.cm_agent_run'),
            ('comind.cm_task'),
            ('comind.cm_conversation'),
            ('comind.cm_evidence'),
            ('comind.cm_policy_rule'),
            ('comind.cm_memory_node'),
            ('comind.cm_budget_authority_binding')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Foundry agent substrate requires existing runtime and authority tables: %', v_missing;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_reject_foundry_substrate_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Foundry substrate provenance is append-only';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_foundry_agent_profile (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_agent(agent_id) ON DELETE RESTRICT,
    actor_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    org_id UUID NOT NULL
        REFERENCES comind.cm_org(org_id) ON DELETE RESTRICT,
    role_code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    authority_floor TEXT NOT NULL DEFAULT 'C0',
    authority_ceiling TEXT NOT NULL DEFAULT 'C1',
    instruction_version TEXT NOT NULL,
    runtime_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
    competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_agent_profile_role_code_ck CHECK (
        role_code ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
    CONSTRAINT cm_foundry_agent_profile_authority_floor_ck CHECK (
        authority_floor IN ('C0', 'C1', 'C2', 'C3', 'C4')
    ),
    CONSTRAINT cm_foundry_agent_profile_authority_ceiling_ck CHECK (
        authority_ceiling IN ('C0', 'C1', 'C2', 'C3', 'C4')
    ),
    CONSTRAINT cm_foundry_agent_profile_authority_order_ck CHECK (
        substring(authority_floor from 2)::int <= substring(authority_ceiling from 2)::int
    ),
    CONSTRAINT cm_foundry_agent_profile_instruction_version_ck CHECK (
        instruction_version ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
    ),
    CONSTRAINT cm_foundry_agent_profile_runtime_defaults_ck CHECK (
        jsonb_typeof(runtime_defaults) = 'object'
    ),
    CONSTRAINT cm_foundry_agent_profile_competencies_ck CHECK (
        jsonb_typeof(competencies) = 'array'
    ),
    CONSTRAINT cm_foundry_agent_profile_status_ck CHECK (
        status IN ('draft', 'active', 'suspended', 'retired')
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_capability (
    capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability_code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    action TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    max_authority TEXT NOT NULL DEFAULT 'C1',
    risk_class TEXT NOT NULL DEFAULT 'low',
    cost_bearing BOOLEAN NOT NULL DEFAULT FALSE,
    adapter TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_capability_code_ck CHECK (
        capability_code ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_capability_action_ck CHECK (
        action ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_capability_target_kind_ck CHECK (
        target_kind ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_capability_authority_ck CHECK (
        max_authority IN ('C0', 'C1', 'C2', 'C3', 'C4')
    ),
    CONSTRAINT cm_foundry_capability_risk_ck CHECK (
        risk_class IN ('low', 'moderate', 'high', 'critical')
    ),
    CONSTRAINT cm_foundry_capability_adapter_ck CHECK (
        adapter ~ '^[a-z][a-z0-9._:-]{1,127}$'
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_capability_grant (
    grant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL
        REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    capability_id UUID NOT NULL
        REFERENCES comind.cm_foundry_capability(capability_id) ON DELETE RESTRICT,
    org_id UUID NOT NULL
        REFERENCES comind.cm_org(org_id) ON DELETE RESTRICT,
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    environment TEXT NOT NULL DEFAULT 'isolated',
    authority_ceiling TEXT NOT NULL DEFAULT 'C1',
    scope JSONB NOT NULL DEFAULT '{}'::jsonb,
    granted_by_actor_id UUID NOT NULL
        REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    grant_reason TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_capability_grant_environment_ck CHECK (
        environment IN ('isolated', 'staging', 'production')
    ),
    CONSTRAINT cm_foundry_capability_grant_authority_ck CHECK (
        authority_ceiling IN ('C0', 'C1', 'C2', 'C3', 'C4')
    ),
    CONSTRAINT cm_foundry_capability_grant_scope_ck CHECK (
        jsonb_typeof(scope) = 'object'
    ),
    CONSTRAINT cm_foundry_capability_grant_expiry_ck CHECK (
        expires_at IS NULL OR expires_at > granted_at
    ),
    CONSTRAINT cm_foundry_capability_grant_revocation_ck CHECK (
        revoked_at IS NULL OR revoked_at >= granted_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_foundry_capability_grant_active_project
    ON comind.cm_foundry_capability_grant (profile_id, capability_id, environment, project_id)
    WHERE revoked_at IS NULL AND project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_foundry_capability_grant_active_global
    ON comind.cm_foundry_capability_grant (profile_id, capability_id, environment)
    WHERE revoked_at IS NULL AND project_id IS NULL;

CREATE TABLE IF NOT EXISTS comind.cm_foundry_authorization_request (
    authorization_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requesting_profile_id UUID
        REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    requesting_actor_id UUID NOT NULL
        REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    capability_id UUID NOT NULL
        REFERENCES comind.cm_foundry_capability(capability_id) ON DELETE RESTRICT,
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    task_id UUID REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    authority_level TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'isolated',
    target_kind TEXT NOT NULL,
    target_ref TEXT,
    reason TEXT NOT NULL,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_authorization_request_authority_ck CHECK (
        authority_level IN ('C0', 'C1', 'C2', 'C3', 'C4')
    ),
    CONSTRAINT cm_foundry_authorization_request_environment_ck CHECK (
        environment IN ('isolated', 'staging', 'production')
    ),
    CONSTRAINT cm_foundry_authorization_request_target_ck CHECK (
        target_kind ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_authorization_request_evidence_refs_ck CHECK (
        jsonb_typeof(evidence_refs) = 'array'
    ),
    CONSTRAINT cm_foundry_authorization_request_status_ck CHECK (
        status IN ('pending', 'approved', 'denied', 'cancelled', 'expired')
    ),
    CONSTRAINT cm_foundry_authorization_request_expiry_ck CHECK (
        expires_at IS NULL OR expires_at > requested_at
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_authorization_decision (
    authorization_decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authorization_request_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_authorization_request(authorization_request_id) ON DELETE RESTRICT,
    decision TEXT NOT NULL,
    decided_by_actor_id UUID NOT NULL
        REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    decision_basis TEXT NOT NULL,
    policy_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    CONSTRAINT cm_foundry_authorization_decision_decision_ck CHECK (
        decision IN ('approved', 'denied', 'cancelled')
    ),
    CONSTRAINT cm_foundry_authorization_decision_policy_refs_ck CHECK (
        jsonb_typeof(policy_refs) = 'array'
    ),
    CONSTRAINT cm_foundry_authorization_decision_effective_until_ck CHECK (
        effective_until IS NULL OR effective_until > decided_at
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_execution_context (
    execution_context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    agent_run_id UUID REFERENCES comind.cm_agent_run(run_id) ON DELETE RESTRICT,
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    task_id UUID REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
    capability_id UUID REFERENCES comind.cm_foundry_capability(capability_id) ON DELETE RESTRICT,
    authorization_decision_id UUID REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    budget_binding_id UUID REFERENCES comind.cm_budget_authority_binding(binding_id) ON DELETE RESTRICT,
    environment TEXT NOT NULL DEFAULT 'isolated',
    execution_kind TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_execution_context_environment_ck CHECK (
        environment IN ('isolated', 'staging', 'production')
    ),
    CONSTRAINT cm_foundry_execution_context_kind_ck CHECK (
        execution_kind IN ('deliberation', 'implementation', 'verification', 'recovery', 'adapter_operation')
    ),
    CONSTRAINT cm_foundry_execution_context_idempotency_ck CHECK (
        idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
    ),
    CONSTRAINT cm_foundry_execution_context_context_ck CHECK (
        jsonb_typeof(context) = 'object'
    ),
    CONSTRAINT cm_foundry_execution_context_closed_ck CHECK (
        closed_at IS NULL OR closed_at >= created_at
    ),
    CONSTRAINT cm_foundry_execution_context_provenance_ck CHECK (
        profile_id IS NOT NULL
        OR agent_run_id IS NOT NULL
        OR authorization_decision_id IS NOT NULL
        OR budget_binding_id IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_foundry_execution_context_idempotency
    ON comind.cm_foundry_execution_context (idempotency_key);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_deliberation (
    deliberation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    task_id UUID REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    opened_by_profile_id UUID REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    topic TEXT NOT NULL,
    protocol TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_deliberation_protocol_ck CHECK (
        protocol IN ('council_drill', 'parallel_planning', 'proof_review', 'radar_review')
    ),
    CONSTRAINT cm_foundry_deliberation_status_ck CHECK (
        status IN ('open', 'closed', 'abandoned')
    ),
    CONSTRAINT cm_foundry_deliberation_closed_ck CHECK (
        closed_at IS NULL OR closed_at >= opened_at
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_deliberation_participant (
    participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID NOT NULL
        REFERENCES comind.cm_foundry_deliberation(deliberation_id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL
        REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    role TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_deliberation_participant_role_ck CHECK (
        role IN ('chair', 'planner', 'critic', 'verifier', 'scribe', 'observer')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_foundry_deliberation_participant_unique
    ON comind.cm_foundry_deliberation_participant (deliberation_id, profile_id, role);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_deliberation_event (
    deliberation_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID NOT NULL
        REFERENCES comind.cm_foundry_deliberation(deliberation_id) ON DELETE RESTRICT,
    participant_id UUID
        REFERENCES comind.cm_foundry_deliberation_participant(participant_id) ON DELETE RESTRICT,
    execution_context_id UUID
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    claim TEXT NOT NULL,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_deliberation_event_type_ck CHECK (
        event_type IN ('proposal', 'objection', 'evidence', 'decision_note', 'risk', 'verification_note')
    ),
    CONSTRAINT cm_foundry_deliberation_event_evidence_refs_ck CHECK (
        jsonb_typeof(evidence_refs) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_deliberation_outcome (
    outcome_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deliberation_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_deliberation(deliberation_id) ON DELETE RESTRICT,
    execution_context_id UUID
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    outcome TEXT NOT NULL,
    summary TEXT NOT NULL,
    required_next_decision TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_deliberation_outcome_outcome_ck CHECK (
        outcome IN ('accepted', 'rejected', 'deferred', 'blocked')
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_recovery_checkpoint (
    recovery_checkpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_context_id UUID
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    checkpoint_kind TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    durable_summary TEXT NOT NULL,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_profile_id UUID REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_recovery_checkpoint_kind_ck CHECK (
        checkpoint_kind IN ('handoff', 'runbook_update', 'provenance_snapshot', 'rollback_marker')
    ),
    CONSTRAINT cm_foundry_recovery_checkpoint_evidence_refs_ck CHECK (
        jsonb_typeof(evidence_refs) = 'array'
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_adapter_operation (
    adapter_operation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_context_id UUID NOT NULL
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    capability_id UUID NOT NULL
        REFERENCES comind.cm_foundry_capability(capability_id) ON DELETE RESTRICT,
    adapter TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    target_kind TEXT NOT NULL,
    target_ref TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    request_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    result_ref TEXT,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT cm_foundry_adapter_operation_adapter_ck CHECK (
        adapter ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_operation_ck CHECK (
        operation_name ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_target_ck CHECK (
        target_kind ~ '^[a-z][a-z0-9._:-]{1,127}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_idempotency_ck CHECK (
        idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_status_ck CHECK (
        status IN ('requested', 'approved', 'succeeded', 'failed', 'cancelled')
    ),
    CONSTRAINT cm_foundry_adapter_operation_completed_ck CHECK (
        completed_at IS NULL OR completed_at >= created_at
    )
);

CREATE INDEX IF NOT EXISTS idx_cm_foundry_profile_org
    ON comind.cm_foundry_agent_profile (org_id, status, role_code);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_authorization_request_project
    ON comind.cm_foundry_authorization_request (project_id, status, requested_at);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_execution_context_project
    ON comind.cm_foundry_execution_context (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_deliberation_project
    ON comind.cm_foundry_deliberation (project_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_adapter_operation_context
    ON comind.cm_foundry_adapter_operation (execution_context_id, created_at);

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_agent_profile',
        'cm_foundry_capability',
        'cm_foundry_capability_grant',
        'cm_foundry_authorization_request',
        'cm_foundry_authorization_decision',
        'cm_foundry_execution_context',
        'cm_foundry_deliberation',
        'cm_foundry_deliberation_participant',
        'cm_foundry_deliberation_event',
        'cm_foundry_deliberation_outcome',
        'cm_foundry_recovery_checkpoint',
        'cm_foundry_adapter_operation'
    ] LOOP
        EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM PUBLIC, anon, authenticated', v_table);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE comind.%I TO service_role', v_table);
    END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA comind TO service_role;

DROP TRIGGER IF EXISTS trg_cm_foundry_authorization_decision_immutable
    ON comind.cm_foundry_authorization_decision;
CREATE TRIGGER trg_cm_foundry_authorization_decision_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_authorization_decision
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_execution_context_immutable
    ON comind.cm_foundry_execution_context;
CREATE TRIGGER trg_cm_foundry_execution_context_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_execution_context
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_deliberation_event_immutable
    ON comind.cm_foundry_deliberation_event;
CREATE TRIGGER trg_cm_foundry_deliberation_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_deliberation_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_deliberation_outcome_immutable
    ON comind.cm_foundry_deliberation_outcome;
CREATE TRIGGER trg_cm_foundry_deliberation_outcome_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_deliberation_outcome
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_recovery_checkpoint_immutable
    ON comind.cm_foundry_recovery_checkpoint;
CREATE TRIGGER trg_cm_foundry_recovery_checkpoint_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_recovery_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_adapter_operation_immutable
    ON comind.cm_foundry_adapter_operation;
CREATE TRIGGER trg_cm_foundry_adapter_operation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_adapter_operation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

REVOKE ALL ON FUNCTION comind.cm_reject_foundry_substrate_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_reject_foundry_substrate_mutation() TO service_role;

COMMENT ON TABLE comind.cm_foundry_agent_profile IS
    'Governed Foundry profile linking each Virtual Employee agent to a durable actor identity and bounded authority envelope.';
COMMENT ON TABLE comind.cm_foundry_capability IS
    'Provider-independent capability registry for governed Foundry agents. It stores actions and risk classes, not credentials.';
COMMENT ON TABLE comind.cm_foundry_capability_grant IS
    'Append-record capability grant for Foundry agents. Live provider authority still requires separate authorization and budget binding.';
COMMENT ON TABLE comind.cm_foundry_authorization_request IS
    'Durable request for Joseph or delegated governance approval before a Foundry agent exercises bounded authority.';
COMMENT ON TABLE comind.cm_foundry_authorization_decision IS
    'Append-only governance decision for a Foundry authorization request.';
COMMENT ON TABLE comind.cm_foundry_execution_context IS
    'Append-only provenance envelope joining agent, capability, authorization, project, task, conversation, and budget authority context.';
COMMENT ON TABLE comind.cm_foundry_deliberation IS
    'Foundry council or planning session header for governed multi-agent deliberation.';
COMMENT ON TABLE comind.cm_foundry_deliberation_event IS
    'Append-only deliberation event stream with evidence references and no raw secret or credential payloads.';
COMMENT ON TABLE comind.cm_foundry_deliberation_outcome IS
    'Append-only deliberation outcome record for council decisions and blocked next decisions.';
COMMENT ON TABLE comind.cm_foundry_recovery_checkpoint IS
    'Append-only recovery checkpoint for handoff, runbook update, provenance snapshot, or rollback marker records.';
COMMENT ON TABLE comind.cm_foundry_adapter_operation IS
    'Append-only adapter operation provenance for connector and provider-independent actions. Request fingerprints replace raw sensitive payloads.';

COMMIT;
