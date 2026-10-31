-- Issue #158: explicit Foundry work-lease RPC privilege hardening.
-- Purpose: remove PostgreSQL's default PUBLIC function EXECUTE privilege so
-- the lease RPCs are directly executable only by the intended service role.
-- This does not grant schema usage or activate a worker.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('comind.cm_foundry_claim_work(text,integer)') IS NULL
       OR to_regprocedure('comind.cm_foundry_renew_work(uuid,text,uuid,bigint,integer)') IS NULL
       OR to_regprocedure('comind.cm_foundry_finish_work(uuid,text,uuid,bigint,boolean)') IS NULL THEN
        RAISE EXCEPTION 'Foundry work-lease RPCs must exist before ACL hardening';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION
    comind.cm_foundry_claim_work(text, integer),
    comind.cm_foundry_renew_work(uuid, text, uuid, bigint, integer),
    comind.cm_foundry_finish_work(uuid, text, uuid, bigint, boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    comind.cm_foundry_claim_work(text, integer),
    comind.cm_foundry_renew_work(uuid, text, uuid, bigint, integer),
    comind.cm_foundry_finish_work(uuid, text, uuid, bigint, boolean)
TO service_role;

COMMIT;
