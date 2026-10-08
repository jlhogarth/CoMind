-- CoMind Foundry runtime orchestration support
-- Version: 1.0.0
-- Date: 2026-10-08
-- Purpose: Add append-only runtime completion records and bounded deliberation metadata.
-- Scope: Repository-only isolated verification. No live Supabase mutation or external adapter execution.

BEGIN;

DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_foundry_execution_context'),
            ('comind.cm_foundry_adapter_operation'),
            ('comind.cm_foundry_deliberation_event'),
            ('comind.cm_foundry_deliberation_outcome'),
            ('comind.cm_foundry_recovery_checkpoint')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Foundry runtime orchestration requires existing Foundry substrate tables: %', v_missing;
    END IF;

    IF to_regprocedure('comind.cm_reject_foundry_substrate_mutation()') IS NULL THEN
        RAISE EXCEPTION 'Foundry runtime orchestration requires the append-only Foundry mutation guard';
    END IF;
END;
$$;

ALTER TABLE comind.cm_foundry_deliberation_event
    ADD COLUMN IF NOT EXISTS round_number SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS arbitration_pass SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reply_to_event_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'cm_foundry_deliberation_event_reply_fk'
          AND conrelid = 'comind.cm_foundry_deliberation_event'::regclass
    ) THEN
        ALTER TABLE comind.cm_foundry_deliberation_event
            ADD CONSTRAINT cm_foundry_deliberation_event_reply_fk
            FOREIGN KEY (reply_to_event_id)
            REFERENCES comind.cm_foundry_deliberation_event(deliberation_event_id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

ALTER TABLE comind.cm_foundry_deliberation_event
    DROP CONSTRAINT IF EXISTS cm_foundry_deliberation_event_type_ck,
    DROP CONSTRAINT IF EXISTS cm_foundry_deliberation_event_round_ck,
    DROP CONSTRAINT IF EXISTS cm_foundry_deliberation_event_arbitration_ck;

ALTER TABLE comind.cm_foundry_deliberation_event
    ADD CONSTRAINT cm_foundry_deliberation_event_type_ck CHECK (
        event_type IN (
            'proposal',
            'objection',
            'evidence',
            'decision_note',
            'decision',
            'dissent',
            'deferred',
            'risk',
            'verification_note'
        )
    ),
    ADD CONSTRAINT cm_foundry_deliberation_event_round_ck CHECK (
        round_number BETWEEN 1 AND 2
    ),
    ADD CONSTRAINT cm_foundry_deliberation_event_arbitration_ck CHECK (
        arbitration_pass BETWEEN 0 AND 1
    );

ALTER TABLE comind.cm_foundry_deliberation_outcome
    DROP CONSTRAINT IF EXISTS cm_foundry_deliberation_outcome_outcome_ck;

ALTER TABLE comind.cm_foundry_deliberation_outcome
    ADD CONSTRAINT cm_foundry_deliberation_outcome_outcome_ck CHECK (
        outcome IN ('accepted', 'accepted_with_dissent', 'rejected', 'deferred', 'blocked')
    );

CREATE TABLE IF NOT EXISTS comind.cm_foundry_adapter_operation_result (
    adapter_operation_result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adapter_operation_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_adapter_operation(adapter_operation_id) ON DELETE RESTRICT,
    terminal_status TEXT NOT NULL,
    result_ref TEXT,
    result_fingerprint TEXT NOT NULL,
    error_code TEXT,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_adapter_operation_result_status_ck CHECK (
        terminal_status IN ('succeeded', 'failed', 'cancelled', 'blocked')
    ),
    CONSTRAINT cm_foundry_adapter_operation_result_ref_ck CHECK (
        result_ref IS NULL OR char_length(result_ref) BETWEEN 1 AND 2048
    ),
    CONSTRAINT cm_foundry_adapter_operation_result_fingerprint_ck CHECK (
        result_fingerprint ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_result_error_ck CHECK (
        error_code IS NULL OR error_code ~ '^[a-z][a-z0-9._:-]{0,127}$'
    ),
    CONSTRAINT cm_foundry_adapter_operation_result_summary_ck CHECK (
        char_length(summary) BETWEEN 1 AND 2048
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_foundry_execution_outcome (
    execution_outcome_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_context_id UUID NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    adapter_operation_result_id UUID UNIQUE
        REFERENCES comind.cm_foundry_adapter_operation_result(adapter_operation_result_id) ON DELETE RESTRICT,
    terminal_status TEXT NOT NULL,
    error_code TEXT,
    summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_foundry_execution_outcome_status_ck CHECK (
        terminal_status IN ('succeeded', 'failed', 'cancelled', 'blocked')
    ),
    CONSTRAINT cm_foundry_execution_outcome_error_ck CHECK (
        error_code IS NULL OR error_code ~ '^[a-z][a-z0-9._:-]{0,127}$'
    ),
    CONSTRAINT cm_foundry_execution_outcome_summary_ck CHECK (
        char_length(summary) BETWEEN 1 AND 2048
    )
);

CREATE INDEX IF NOT EXISTS idx_cm_foundry_adapter_operation_result_created
    ON comind.cm_foundry_adapter_operation_result (created_at);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_execution_outcome_created
    ON comind.cm_foundry_execution_outcome (created_at);
CREATE INDEX IF NOT EXISTS idx_cm_foundry_deliberation_event_reply
    ON comind.cm_foundry_deliberation_event (reply_to_event_id)
    WHERE reply_to_event_id IS NOT NULL;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_adapter_operation_result',
        'cm_foundry_execution_outcome'
    ] LOOP
        EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM PUBLIC, anon, authenticated', v_table);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE comind.%I TO service_role', v_table);
    END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_foundry_adapter_operation_result_immutable
    ON comind.cm_foundry_adapter_operation_result;
CREATE TRIGGER trg_cm_foundry_adapter_operation_result_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_adapter_operation_result
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

DROP TRIGGER IF EXISTS trg_cm_foundry_execution_outcome_immutable
    ON comind.cm_foundry_execution_outcome;
CREATE TRIGGER trg_cm_foundry_execution_outcome_immutable
BEFORE UPDATE OR DELETE ON comind.cm_foundry_execution_outcome
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

COMMENT ON COLUMN comind.cm_foundry_deliberation_event.round_number IS
    'Bounded review round. Runtime orchestration permits rounds 1 and 2 only.';
COMMENT ON COLUMN comind.cm_foundry_deliberation_event.arbitration_pass IS
    'Bounded arbitration pass marker. Zero is normal review; one is the only permitted arbitration pass.';
COMMENT ON COLUMN comind.cm_foundry_deliberation_event.reply_to_event_id IS
    'Optional same-deliberation event dependency used for explicit objection, evidence, review, and decision lineage.';
COMMENT ON TABLE comind.cm_foundry_adapter_operation_result IS
    'Append-only terminal result for one immutable Foundry adapter operation. Stores bounded references and fingerprints, never raw provider payloads or credentials.';
COMMENT ON TABLE comind.cm_foundry_execution_outcome IS
    'Append-only terminal outcome for one immutable Foundry execution context. Lifecycle completion does not mutate the original context row.';

COMMIT;
