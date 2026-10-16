\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS sdn_core.schema_contracts (
  component text PRIMARY KEY,
  schema_version text NOT NULL,
  contract_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO sdn_core.schema_contracts(component,schema_version,contract_hash)
VALUES ('sdn-core','2.0.0',encode(digest('sdn-core:2.0.0:sdn-002-recovery-foundation','sha256'),'hex'))
ON CONFLICT (component) DO NOTHING;

DROP TRIGGER IF EXISTS schema_contracts_immutable ON sdn_core.schema_contracts;
CREATE TRIGGER schema_contracts_immutable
BEFORE UPDATE OR DELETE ON sdn_core.schema_contracts
FOR EACH ROW EXECUTE FUNCTION sdn_core.deny_mutation();

CREATE OR REPLACE FUNCTION sdn_core.assert_schema_version(p_component text, p_expected_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdn_core
AS $$
DECLARE observed_version text;
BEGIN
  SELECT schema_version INTO observed_version FROM sdn_core.schema_contracts WHERE component=p_component;
  IF observed_version IS NULL THEN
    RAISE EXCEPTION 'schema contract % is not registered', p_component USING ERRCODE='P0002';
  END IF;
  IF observed_version <> p_expected_version THEN
    RAISE EXCEPTION 'schema contract mismatch for %: expected %, observed %', p_component, p_expected_version, observed_version USING ERRCODE='55000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION sdn_core.assert_schema_version(text,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA sdn_evidence TO sdn_backup_role, sdn_admin_role;
