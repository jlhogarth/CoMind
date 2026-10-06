BEGIN;

CREATE TABLE IF NOT EXISTS public.comind_workflow_blockers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id uuid NOT NULL,
    workflow_step_id uuid,
    blocker_type text NOT NULL,
    required_input text NOT NULL,
    blocking_reason text NOT NULL,
    resolution_owner text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'open',
    resolution text,
    resolved_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CONSTRAINT comind_workflow_blockers_run_fk
        FOREIGN KEY (workflow_run_id)
        REFERENCES public.comind_workflow_runs(id)
        ON DELETE CASCADE,
    CONSTRAINT comind_workflow_blockers_step_fk
        FOREIGN KEY (workflow_step_id)
        REFERENCES public.comind_workflow_steps(id)
        ON DELETE CASCADE,
    CONSTRAINT comind_workflow_blockers_type_ck
        CHECK (blocker_type IN (
            'missing_input',
            'unverified_identifier',
            'unresolved_dependency',
            'unsafe_assumption'
        )),
    CONSTRAINT comind_workflow_blockers_status_ck
        CHECK (status IN ('open', 'resolved', 'withdrawn')),
    CONSTRAINT comind_workflow_blockers_required_input_ck
        CHECK (length(btrim(required_input)) > 0),
    CONSTRAINT comind_workflow_blockers_reason_ck
        CHECK (length(btrim(blocking_reason)) > 0),
    CONSTRAINT comind_workflow_blockers_owner_ck
        CHECK (length(btrim(resolution_owner)) > 0),
    CONSTRAINT comind_workflow_blockers_resolution_ck
        CHECK (
            (status = 'open' AND resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
            OR
            (status IN ('resolved', 'withdrawn') AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comind_workflow_blockers_open_run
    ON public.comind_workflow_blockers (
        workflow_run_id,
        blocker_type,
        required_input
    )
    WHERE status = 'open' AND workflow_step_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comind_workflow_blockers_open_step
    ON public.comind_workflow_blockers (
        workflow_run_id,
        workflow_step_id,
        blocker_type,
        required_input
    )
    WHERE status = 'open' AND workflow_step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comind_workflow_blockers_resolution_queue
    ON public.comind_workflow_blockers (resolution_owner, created_at)
    WHERE status = 'open';

ALTER TABLE public.comind_workflow_blockers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.comind_workflow_blockers FROM PUBLIC;

DO $roles$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.comind_workflow_blockers FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.comind_workflow_blockers FROM authenticated;
    END IF;
END;
$roles$;

COMMENT ON TABLE public.comind_workflow_blockers IS
    'Explicit blockers that prevent agents from replacing missing information with fabricated or assumed values.';

CREATE OR REPLACE FUNCTION public.comind_open_workflow_blocker(
    p_workflow_run_id uuid,
    p_workflow_step_id uuid,
    p_blocker_type text,
    p_required_input text,
    p_blocking_reason text,
    p_resolution_owner text,
    p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_blocker_id uuid;
BEGIN
    IF p_workflow_step_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.comind_workflow_steps
        WHERE id = p_workflow_step_id
          AND workflow_run_id = p_workflow_run_id
    ) THEN
        RAISE EXCEPTION
            'workflow_step_id % does not belong to workflow_run_id %',
            p_workflow_step_id,
            p_workflow_run_id
            USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.comind_workflow_blockers (
        workflow_run_id,
        workflow_step_id,
        blocker_type,
        required_input,
        blocking_reason,
        resolution_owner,
        evidence
    )
    VALUES (
        p_workflow_run_id,
        p_workflow_step_id,
        p_blocker_type,
        p_required_input,
        p_blocking_reason,
        p_resolution_owner,
        COALESCE(p_evidence, '{}'::jsonb)
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.comind_workflow_blockers
    SET
        blocking_reason = p_blocking_reason,
        resolution_owner = p_resolution_owner,
        evidence = evidence || COALESCE(p_evidence, '{}'::jsonb)
    WHERE workflow_run_id = p_workflow_run_id
      AND workflow_step_id IS NOT DISTINCT FROM p_workflow_step_id
      AND blocker_type = p_blocker_type
      AND required_input = p_required_input
      AND status = 'open'
    RETURNING id INTO v_blocker_id;

    RETURN v_blocker_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.comind_open_workflow_blocker(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    jsonb
) FROM PUBLIC;

INSERT INTO public.comind_governance_decisions (
    decision_key,
    decision_type,
    decision_text,
    owner,
    status,
    metadata
)
VALUES (
    'development.no_placeholder_policy.v1',
    'development_policy',
    'Agents must not introduce fabricated identifiers, guessed configuration values, stubbed logic, pseudocode, incomplete migrations, dummy endpoints, or unresolved marker tokens into deliverable artifacts. Missing information must be recorded as an explicit workflow blocker and must never be replaced by an invented value.',
    'Joseph Hogarth',
    'accepted',
    jsonb_build_object(
        'effective_date', '2026-09-13',
        'authority_level', 'C4',
        'enforcement', jsonb_build_array(
            'agent_instruction',
            'repository_scan',
            'continuous_integration_gate',
            'workflow_blocker_record'
        ),
        'allowed', jsonb_build_array(
            'named_environment_variables',
            'isolated_synthetic_test_fixtures',
            'documented_runtime_generated_values'
        )
    )
)
ON CONFLICT (decision_key)
DO UPDATE SET
    decision_type = EXCLUDED.decision_type,
    decision_text = EXCLUDED.decision_text,
    owner = EXCLUDED.owner,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    updated_at = now();

COMMIT;
