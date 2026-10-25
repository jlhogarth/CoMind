-- CFR isolated-CI compatibility shim
--
-- Supabase Test uses cm_reject_cfr_evidence_mutation() to reject both UPDATE
-- and DELETE. Local integration fixtures intentionally allow cascade DELETE so
-- test conversations can clean themselves up. Keep the canonical function name
-- while preserving that local-only exception.

CREATE OR REPLACE FUNCTION comind.cm_reject_cfr_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only; insert a corrective or superseding record instead', TG_TABLE_NAME;
  END IF;

  RETURN OLD;
END;
$$;
