BEGIN;
GRANT EXECUTE ON FUNCTION comind.cm_ger_payload_has_forbidden_key(jsonb) TO comind_ger_runtime;
COMMIT;
