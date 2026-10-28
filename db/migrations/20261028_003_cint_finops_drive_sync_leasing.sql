-- CINT-FINOPS-002: bounded Google Drive mirror leasing and recovery.
-- Issue: https://github.com/jlhogarth/CoMind/issues/282
-- Parent: https://github.com/jlhogarth/CoMind/issues/274
--
-- Supabase remains the authoritative financial ledger. These objects only coordinate
-- a human-readable Google Drive mirror and never modify immutable financial facts.

BEGIN;

DO $$
BEGIN
    IF to_regclass('comind.cm_api_cost_receipt') IS NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-002 requires comind.cm_api_cost_receipt';
    END IF;
END;
$$;

ALTER TABLE comind.cm_api_cost_receipt
    ADD COLUMN IF NOT EXISTS drive_sync_attempt_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS drive_sync_claim_token uuid,
    ADD COLUMN IF NOT EXISTS drive_sync_claimed_at timestamptz,
    ADD COLUMN IF NOT EXISTS drive_sync_last_attempt_at timestamptz,
    ADD COLUMN IF NOT EXISTS drive_receipt_file_id text,
    ADD COLUMN IF NOT EXISTS drive_receipt_file_url text;

ALTER TABLE comind.cm_api_cost_receipt
    DROP CONSTRAINT IF EXISTS cm_api_cost_receipt_drive_status_ck,
    DROP CONSTRAINT IF EXISTS cm_api_cost_receipt_drive_attempt_count_ck,
    DROP CONSTRAINT IF EXISTS cm_api_cost_receipt_drive_claim_ck,
    DROP CONSTRAINT IF EXISTS cm_api_cost_receipt_drive_complete_ck;

ALTER TABLE comind.cm_api_cost_receipt
    ADD CONSTRAINT cm_api_cost_receipt_drive_status_ck CHECK (
        drive_sync_status IN ('pending', 'syncing', 'synced', 'error', 'not_required')
    ),
    ADD CONSTRAINT cm_api_cost_receipt_drive_attempt_count_ck CHECK (
        drive_sync_attempt_count >= 0
    ),
    ADD CONSTRAINT cm_api_cost_receipt_drive_claim_ck CHECK (
        (drive_sync_status = 'syncing'
         AND drive_sync_claim_token IS NOT NULL
         AND drive_sync_claimed_at IS NOT NULL)
        OR
        (drive_sync_status <> 'syncing'
         AND drive_sync_claim_token IS NULL
         AND drive_sync_claimed_at IS NULL)
    ),
    ADD CONSTRAINT cm_api_cost_receipt_drive_complete_ck CHECK (
        drive_sync_status <> 'synced'
        OR (
            drive_register_file_id IS NOT NULL
            AND btrim(drive_register_file_id) <> ''
            AND drive_row_key IS NOT NULL
            AND btrim(drive_row_key) <> ''
            AND drive_receipt_file_id IS NOT NULL
            AND btrim(drive_receipt_file_id) <> ''
            AND drive_receipt_file_url IS NOT NULL
            AND btrim(drive_receipt_file_url) <> ''
            AND drive_synced_at IS NOT NULL
        )
    );

DROP INDEX IF EXISTS comind.cm_api_cost_receipt_drive_sync_idx;
CREATE INDEX cm_api_cost_receipt_drive_sync_idx
    ON comind.cm_api_cost_receipt(
        drive_sync_status,
        drive_sync_claimed_at,
        transaction_at,
        receipt_id
    )
    WHERE drive_sync_status IN ('pending', 'error', 'syncing');

CREATE OR REPLACE FUNCTION comind.cm_claim_api_cost_drive_sync(
    p_limit integer DEFAULT 25,
    p_stale_after interval DEFAULT interval '30 minutes'
)
RETURNS TABLE (
    receipt_id uuid,
    receipt_number text,
    claim_token uuid,
    prior_status text,
    attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
BEGIN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
        RAISE EXCEPTION 'Drive sync claim limit must be between 1 and 100';
    END IF;
    IF p_stale_after IS NULL
       OR p_stale_after < interval '5 minutes'
       OR p_stale_after > interval '24 hours' THEN
        RAISE EXCEPTION 'Drive sync stale interval must be between 5 minutes and 24 hours';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT
            r.receipt_id,
            r.drive_sync_status AS prior_status
        FROM comind.cm_api_cost_receipt AS r
        WHERE r.drive_sync_status IN ('pending', 'error')
           OR (
                r.drive_sync_status = 'syncing'
                AND r.drive_sync_claimed_at <= v_now - p_stale_after
           )
        ORDER BY r.transaction_at, r.receipt_id
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    ), claimed AS (
        UPDATE comind.cm_api_cost_receipt AS r
        SET drive_sync_status = 'syncing',
            drive_sync_claim_token = pg_catalog.gen_random_uuid(),
            drive_sync_claimed_at = v_now,
            drive_sync_last_attempt_at = v_now,
            drive_sync_attempt_count = r.drive_sync_attempt_count + 1,
            drive_sync_error = NULL
        FROM candidates AS c
        WHERE r.receipt_id = c.receipt_id
        RETURNING
            r.receipt_id,
            r.receipt_number,
            r.drive_sync_claim_token,
            c.prior_status,
            r.drive_sync_attempt_count
    )
    SELECT
        c.receipt_id,
        c.receipt_number,
        c.drive_sync_claim_token,
        c.prior_status,
        c.drive_sync_attempt_count
    FROM claimed AS c
    ORDER BY c.receipt_number;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_complete_api_cost_drive_sync(
    p_receipt_id uuid,
    p_claim_token uuid,
    p_drive_register_file_id text,
    p_drive_row_key text,
    p_drive_receipt_file_id text,
    p_drive_receipt_file_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_updated integer;
    v_existing comind.cm_api_cost_receipt%ROWTYPE;
BEGIN
    IF p_receipt_id IS NULL OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Receipt and claim token are required to complete Drive sync';
    END IF;
    IF NULLIF(btrim(p_drive_register_file_id), '') IS NULL
       OR NULLIF(btrim(p_drive_row_key), '') IS NULL
       OR NULLIF(btrim(p_drive_receipt_file_id), '') IS NULL
       OR NULLIF(btrim(p_drive_receipt_file_url), '') IS NULL THEN
        RAISE EXCEPTION 'Verified register and receipt document references are required to complete Drive sync';
    END IF;

    UPDATE comind.cm_api_cost_receipt
    SET drive_sync_status = 'synced',
        drive_register_file_id = btrim(p_drive_register_file_id),
        drive_row_key = btrim(p_drive_row_key),
        drive_receipt_file_id = btrim(p_drive_receipt_file_id),
        drive_receipt_file_url = btrim(p_drive_receipt_file_url),
        drive_synced_at = clock_timestamp(),
        drive_sync_error = NULL,
        drive_sync_claim_token = NULL,
        drive_sync_claimed_at = NULL
    WHERE receipt_id = p_receipt_id
      AND drive_sync_status = 'syncing'
      AND drive_sync_claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
        RETURN true;
    END IF;

    SELECT *
    INTO v_existing
    FROM comind.cm_api_cost_receipt
    WHERE receipt_id = p_receipt_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Drive sync receipt % does not exist', p_receipt_id;
    END IF;

    IF v_existing.drive_sync_status = 'synced'
       AND v_existing.drive_register_file_id = btrim(p_drive_register_file_id)
       AND v_existing.drive_row_key = btrim(p_drive_row_key)
       AND v_existing.drive_receipt_file_id = btrim(p_drive_receipt_file_id)
       AND v_existing.drive_receipt_file_url = btrim(p_drive_receipt_file_url) THEN
        RETURN false;
    END IF;

    RAISE EXCEPTION 'Drive sync completion rejected for receipt % because claim is stale, missing, or conflicts with existing evidence', p_receipt_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_fail_api_cost_drive_sync(
    p_receipt_id uuid,
    p_claim_token uuid,
    p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_updated integer;
BEGIN
    IF p_receipt_id IS NULL OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Receipt and claim token are required to fail Drive sync';
    END IF;
    IF NULLIF(btrim(p_error), '') IS NULL THEN
        RAISE EXCEPTION 'Drive sync failure requires diagnostic evidence';
    END IF;

    UPDATE comind.cm_api_cost_receipt
    SET drive_sync_status = 'error',
        drive_sync_error = left(btrim(p_error), 2000),
        drive_sync_claim_token = NULL,
        drive_sync_claimed_at = NULL
    WHERE receipt_id = p_receipt_id
      AND drive_sync_status = 'syncing'
      AND drive_sync_claim_token = p_claim_token;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 1 THEN
        RETURN true;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM comind.cm_api_cost_receipt
        WHERE receipt_id = p_receipt_id
          AND drive_sync_status = 'error'
          AND drive_sync_claim_token IS NULL
    ) THEN
        RETURN false;
    END IF;

    RAISE EXCEPTION 'Drive sync failure rejected for receipt % because claim is stale, missing, or already completed', p_receipt_id;
END;
$$;

COMMENT ON FUNCTION comind.cm_claim_api_cost_drive_sync(integer, interval) IS
    'Claims pending/error or stale Drive mirror work with SKIP LOCKED. This coordinates only the audit mirror; financial facts remain immutable.';
COMMENT ON FUNCTION comind.cm_complete_api_cost_drive_sync(uuid, uuid, text, text, text, text) IS
    'Marks one claimed API cost receipt mirrored only after verified Sheet row and internal receipt document references are supplied. Exact completion replay is idempotent.';
COMMENT ON FUNCTION comind.cm_fail_api_cost_drive_sync(uuid, uuid, text) IS
    'Records a Drive mirror failure without changing authoritative financial facts and releases the claim for retry.';

REVOKE ALL ON FUNCTION comind.cm_claim_api_cost_drive_sync(integer, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_complete_api_cost_drive_sync(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_fail_api_cost_drive_sync(uuid, uuid, text) FROM PUBLIC;

DO $$
BEGIN
    IF to_regrole('anon') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION comind.cm_claim_api_cost_drive_sync(integer, interval) FROM anon;
        REVOKE ALL ON FUNCTION comind.cm_complete_api_cost_drive_sync(uuid, uuid, text, text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION comind.cm_fail_api_cost_drive_sync(uuid, uuid, text) FROM anon;
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION comind.cm_claim_api_cost_drive_sync(integer, interval) FROM authenticated;
        REVOKE ALL ON FUNCTION comind.cm_complete_api_cost_drive_sync(uuid, uuid, text, text, text, text) FROM authenticated;
        REVOKE ALL ON FUNCTION comind.cm_fail_api_cost_drive_sync(uuid, uuid, text) FROM authenticated;
    END IF;
    IF to_regrole('service_role') IS NOT NULL THEN
        GRANT EXECUTE ON FUNCTION comind.cm_claim_api_cost_drive_sync(integer, interval) TO service_role;
        GRANT EXECUTE ON FUNCTION comind.cm_complete_api_cost_drive_sync(uuid, uuid, text, text, text, text) TO service_role;
        GRANT EXECUTE ON FUNCTION comind.cm_fail_api_cost_drive_sync(uuid, uuid, text) TO service_role;
    END IF;
END;
$$;

COMMIT;
