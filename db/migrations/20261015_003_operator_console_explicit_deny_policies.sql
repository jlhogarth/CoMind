BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_console_relation_registry'
          AND policyname = 'operator_console_deny_ordinary_roles'
    ) THEN
        CREATE POLICY operator_console_deny_ordinary_roles
            ON public.operator_console_relation_registry
            AS RESTRICTIVE
            FOR ALL
            TO anon, authenticated
            USING (false)
            WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_console_verification_records'
          AND policyname = 'operator_console_deny_ordinary_roles'
    ) THEN
        CREATE POLICY operator_console_deny_ordinary_roles
            ON public.operator_console_verification_records
            AS RESTRICTIVE
            FOR ALL
            TO anon, authenticated
            USING (false)
            WITH CHECK (false);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_console_mutation_audit'
          AND policyname = 'operator_console_deny_ordinary_roles'
    ) THEN
        CREATE POLICY operator_console_deny_ordinary_roles
            ON public.operator_console_mutation_audit
            AS RESTRICTIVE
            FOR ALL
            TO anon, authenticated
            USING (false)
            WITH CHECK (false);
    END IF;
END;
$$;

COMMIT;
