-- Issue #158: pin the Foundry work-lease RPC search path.
-- Scope: the three lease RPCs activated for the Test-stage runtime milestone.
-- The functions use fully qualified CoMind relations and PostgreSQL built-ins.

BEGIN;

ALTER FUNCTION comind.cm_foundry_claim_work(text, integer)
    SET search_path = pg_catalog, comind;
ALTER FUNCTION comind.cm_foundry_renew_work(uuid, text, uuid, bigint, integer)
    SET search_path = pg_catalog, comind;
ALTER FUNCTION comind.cm_foundry_finish_work(uuid, text, uuid, bigint, boolean)
    SET search_path = pg_catalog, comind;

COMMIT;
