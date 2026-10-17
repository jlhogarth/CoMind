BEGIN;

REVOKE ALL ON TABLE public.operator_console_relation_registry FROM service_role;
REVOKE ALL ON TABLE public.operator_console_verification_records FROM service_role;
REVOKE ALL ON TABLE public.operator_console_mutation_audit FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.operator_console_relation_registry
    TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.operator_console_verification_records
    TO service_role;

GRANT SELECT, INSERT
    ON TABLE public.operator_console_mutation_audit
    TO service_role;

COMMENT ON TABLE public.operator_console_mutation_audit IS
    'Append-only audit evidence for Operator Console administrative mutation attempts. service_role is restricted to SELECT and INSERT; UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER are not delegated.';

COMMIT;
