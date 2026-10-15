BEGIN;

CREATE TABLE IF NOT EXISTS public.operator_console_relation_registry (
    schema_name text NOT NULL,
    relation_name text NOT NULL,
    browser_read boolean NOT NULL DEFAULT false,
    admin_insert boolean NOT NULL DEFAULT false,
    admin_update boolean NOT NULL DEFAULT false,
    admin_delete boolean NOT NULL DEFAULT false,
    destructive_allowed boolean NOT NULL DEFAULT false,
    enabled boolean NOT NULL DEFAULT true,
    rationale text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (schema_name, relation_name),
    CONSTRAINT operator_console_registry_schema_identifier_ck
        CHECK (schema_name ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
    CONSTRAINT operator_console_registry_relation_identifier_ck
        CHECK (relation_name ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
    CONSTRAINT operator_console_registry_delete_guard_ck
        CHECK (NOT admin_delete OR destructive_allowed)
);

CREATE TABLE IF NOT EXISTS public.operator_console_verification_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    record_key text NOT NULL UNIQUE,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_test_data boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT operator_console_verification_test_only_ck CHECK (is_test_data)
);

CREATE TABLE IF NOT EXISTS public.operator_console_mutation_audit (
    audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL,
    actor text NOT NULL,
    operation text,
    target_schema text,
    target_relation text,
    target_key jsonb,
    before_row jsonb,
    after_row jsonb,
    provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
    succeeded boolean NOT NULL,
    error_code text,
    error_message text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT operator_console_audit_operation_ck
        CHECK (operation IS NULL OR operation IN ('insert', 'update', 'delete', 'schema_migration', 'verification'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_operator_console_successful_request
    ON public.operator_console_mutation_audit(request_id)
    WHERE succeeded AND operation IN ('insert', 'update', 'delete');

CREATE INDEX IF NOT EXISTS idx_operator_console_audit_target_time
    ON public.operator_console_mutation_audit(target_schema, target_relation, occurred_at DESC);

ALTER TABLE public.operator_console_relation_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_console_verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_console_mutation_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operator_console_relation_registry FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operator_console_verification_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operator_console_mutation_audit FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operator_console_relation_registry TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operator_console_verification_records TO service_role;
GRANT SELECT, INSERT ON TABLE public.operator_console_mutation_audit TO service_role;

INSERT INTO public.operator_console_relation_registry (
    schema_name,
    relation_name,
    browser_read,
    admin_insert,
    admin_update,
    admin_delete,
    destructive_allowed,
    enabled,
    rationale,
    updated_at
)
VALUES
    ('public', 'users', true, true, true, false, false, true,
     'OC-002 live relational surface. Browser access remains subject to PostgreSQL grants and RLS; administrative delete is not delegated.', now()),
    ('public', 'posts', true, true, true, false, false, true,
     'OC-002 live relational surface. Browser access remains subject to PostgreSQL grants and RLS; administrative delete is not delegated.', now()),
    ('public', 'comments', true, true, true, false, false, true,
     'OC-002 live relational surface. Browser access remains subject to PostgreSQL grants and RLS; administrative delete is not delegated.', now()),
    ('public', 'operator_console_verification_records', false, true, true, true, true, true,
     'OC-002 bounded non-sensitive test surface. Delete is permitted only for explicitly marked verification data.', now())
ON CONFLICT (schema_name, relation_name) DO UPDATE SET
    browser_read = EXCLUDED.browser_read,
    admin_insert = EXCLUDED.admin_insert,
    admin_update = EXCLUDED.admin_update,
    admin_delete = EXCLUDED.admin_delete,
    destructive_allowed = EXCLUDED.destructive_allowed,
    enabled = EXCLUDED.enabled,
    rationale = EXCLUDED.rationale,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.operator_console_reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'operator_console_mutation_audit is append-only'
        USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.operator_console_reject_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_operator_console_audit_append_only
    ON public.operator_console_mutation_audit;
CREATE TRIGGER trg_operator_console_audit_append_only
BEFORE UPDATE OR DELETE ON public.operator_console_mutation_audit
FOR EACH ROW EXECUTE FUNCTION public.operator_console_reject_audit_mutation();

CREATE OR REPLACE FUNCTION public.operator_console_schema_metadata()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
WITH allowed AS (
    SELECT r.schema_name, r.relation_name
    FROM public.operator_console_relation_registry r
    WHERE r.enabled AND r.browser_read
),
relations AS (
    SELECT
        n.nspname AS schema_name,
        c.relname AS relation_name,
        CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END AS relation_kind,
        c.oid AS relation_oid
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN allowed a ON a.schema_name = n.nspname AND a.relation_name = c.relname
    WHERE c.relkind IN ('r', 'p', 'v', 'm')
),
relation_json AS (
    SELECT jsonb_build_object(
        'schema', r.schema_name,
        'name', r.relation_name,
        'kind', r.relation_kind,
        'columns', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', col.column_name,
                    'ordinalPosition', col.ordinal_position,
                    'dataType', col.data_type,
                    'udtName', col.udt_name,
                    'nullable', col.is_nullable = 'YES',
                    'defaultExpression', col.column_default,
                    'generated', col.is_generated <> 'NEVER',
                    'identity', col.is_identity = 'YES',
                    'primaryKey', EXISTS (
                        SELECT 1
                        FROM pg_catalog.pg_index i
                        JOIN pg_catalog.pg_attribute a
                          ON a.attrelid = i.indrelid
                         AND a.attnum = ANY(i.indkey)
                        WHERE i.indrelid = r.relation_oid
                          AND i.indisprimary
                          AND a.attname = col.column_name
                    )
                ) ORDER BY col.ordinal_position
            )
            FROM information_schema.columns col
            WHERE col.table_schema = r.schema_name
              AND col.table_name = r.relation_name
        ), '[]'::jsonb)
    ) AS relation
    FROM relations r
),
foreign_key_json AS (
    SELECT jsonb_build_object(
        'constraintName', con.conname,
        'sourceSchema', src_ns.nspname,
        'sourceRelation', src.relname,
        'sourceColumns', (
            SELECT jsonb_agg(src_att.attname ORDER BY key_cols.ordinality)
            FROM unnest(con.conkey, con.confkey) WITH ORDINALITY
                 AS key_cols(src_attnum, target_attnum, ordinality)
            JOIN pg_catalog.pg_attribute src_att
              ON src_att.attrelid = con.conrelid
             AND src_att.attnum = key_cols.src_attnum
        ),
        'targetSchema', target_ns.nspname,
        'targetRelation', target.relname,
        'targetColumns', (
            SELECT jsonb_agg(target_att.attname ORDER BY key_cols.ordinality)
            FROM unnest(con.conkey, con.confkey) WITH ORDINALITY
                 AS key_cols(src_attnum, target_attnum, ordinality)
            JOIN pg_catalog.pg_attribute target_att
              ON target_att.attrelid = con.confrelid
             AND target_att.attnum = key_cols.target_attnum
        ),
        'onDelete', CASE con.confdeltype
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            WHEN 'r' THEN 'RESTRICT'
            ELSE 'NO ACTION'
        END,
        'onUpdate', CASE con.confupdtype
            WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL'
            WHEN 'd' THEN 'SET DEFAULT'
            WHEN 'r' THEN 'RESTRICT'
            ELSE 'NO ACTION'
        END
    ) AS foreign_key
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
    JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
    JOIN pg_catalog.pg_class target ON target.oid = con.confrelid
    JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target.relnamespace
    JOIN allowed src_allowed
      ON src_allowed.schema_name = src_ns.nspname
     AND src_allowed.relation_name = src.relname
    JOIN allowed target_allowed
      ON target_allowed.schema_name = target_ns.nspname
     AND target_allowed.relation_name = target.relname
    WHERE con.contype = 'f'
)
SELECT jsonb_build_object(
    'relations', COALESCE((SELECT jsonb_agg(relation ORDER BY relation->>'schema', relation->>'name') FROM relation_json), '[]'::jsonb),
    'foreignKeys', COALESCE((SELECT jsonb_agg(foreign_key ORDER BY foreign_key->>'constraintName') FROM foreign_key_json), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.operator_console_schema_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_schema_metadata() TO service_role;

CREATE OR REPLACE FUNCTION public.operator_console_apply_mutation(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_request_id uuid := gen_random_uuid();
    v_actor text;
    v_operation text;
    v_schema text;
    v_relation text;
    v_key jsonb := '{}'::jsonb;
    v_values jsonb := '{}'::jsonb;
    v_provenance jsonb := '{}'::jsonb;
    v_cfg public.operator_console_relation_registry%ROWTYPE;
    v_relation_oid oid;
    v_pk_cols text[];
    v_sorted_pk_cols text[];
    v_key_cols text[];
    v_value_cols text[];
    v_col text;
    v_col_list text;
    v_select_cols text;
    v_set_clause text;
    v_where_clause text;
    v_sql text;
    v_before jsonb;
    v_after jsonb;
    v_target_key jsonb := '{}'::jsonb;
    v_replayed jsonb;
    v_error_code text;
    v_error_message text;
BEGIN
    IF jsonb_typeof(p_request) <> 'object' THEN
        RAISE EXCEPTION 'mutation request must be a JSON object' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(p_request->>'requestId', '') = '' THEN
        RAISE EXCEPTION 'requestId is required' USING ERRCODE = '22023';
    END IF;
    v_request_id := (p_request->>'requestId')::uuid;
    v_actor := btrim(COALESCE(p_request->>'actor', ''));
    v_operation := lower(btrim(COALESCE(p_request->>'operation', '')));
    v_schema := btrim(COALESCE(p_request->>'schema', ''));
    v_relation := btrim(COALESCE(p_request->>'relation', ''));
    v_key := COALESCE(p_request->'key', '{}'::jsonb);
    v_values := COALESCE(p_request->'values', '{}'::jsonb);
    v_provenance := COALESCE(p_request->'provenance', '{}'::jsonb);

    IF v_actor = '' OR length(v_actor) > 200 THEN
        RAISE EXCEPTION 'actor is required and must be at most 200 characters' USING ERRCODE = '22023';
    END IF;
    IF v_operation NOT IN ('insert', 'update', 'delete') THEN
        RAISE EXCEPTION 'unsupported mutation operation' USING ERRCODE = '22023';
    END IF;
    IF v_schema <> 'public' THEN
        RAISE EXCEPTION 'OC-002 mutations are restricted to the public schema' USING ERRCODE = '42501';
    END IF;
    IF v_schema !~ '^[A-Za-z_][A-Za-z0-9_]*$' OR v_relation !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
        RAISE EXCEPTION 'invalid schema or relation identifier' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_key) <> 'object' OR jsonb_typeof(v_values) <> 'object' OR jsonb_typeof(v_provenance) <> 'object' THEN
        RAISE EXCEPTION 'key, values, and provenance must be JSON objects' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));

    SELECT to_jsonb(a.*)
    INTO v_replayed
    FROM public.operator_console_mutation_audit a
    WHERE a.request_id = v_request_id
      AND a.succeeded
      AND a.operation IN ('insert', 'update', 'delete')
    ORDER BY a.occurred_at
    LIMIT 1;

    IF v_replayed IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'requestId', v_request_id,
            'row', COALESCE(v_replayed->'after_row', v_replayed->'before_row')
        );
    END IF;

    SELECT * INTO v_cfg
    FROM public.operator_console_relation_registry r
    WHERE r.schema_name = v_schema
      AND r.relation_name = v_relation
      AND r.enabled;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'relation is not enabled for Operator Console administration' USING ERRCODE = '42501';
    END IF;
    IF v_operation = 'insert' AND NOT v_cfg.admin_insert THEN
        RAISE EXCEPTION 'insert is not delegated for this relation' USING ERRCODE = '42501';
    ELSIF v_operation = 'update' AND NOT v_cfg.admin_update THEN
        RAISE EXCEPTION 'update is not delegated for this relation' USING ERRCODE = '42501';
    ELSIF v_operation = 'delete' AND (NOT v_cfg.admin_delete OR NOT v_cfg.destructive_allowed) THEN
        RAISE EXCEPTION 'delete is not delegated for this relation' USING ERRCODE = '42501';
    END IF;

    v_relation_oid := to_regclass(format('%I.%I', v_schema, v_relation));
    IF v_relation_oid IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        WHERE c.oid = v_relation_oid AND c.relkind IN ('r', 'p')
    ) THEN
        RAISE EXCEPTION 'target relation does not exist as a writable table' USING ERRCODE = '42P01';
    END IF;

    SELECT array_agg(a.attname ORDER BY key_col.ordinality)
    INTO v_pk_cols
    FROM pg_catalog.pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_col(attnum, ordinality)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum = key_col.attnum
    WHERE i.indrelid = v_relation_oid
      AND i.indisprimary;

    IF v_pk_cols IS NULL OR cardinality(v_pk_cols) = 0 THEN
        RAISE EXCEPTION 'target relation must have a primary key' USING ERRCODE = '55000';
    END IF;

    SELECT array_agg(c ORDER BY c) INTO v_sorted_pk_cols FROM unnest(v_pk_cols) AS c;

    IF v_operation IN ('update', 'delete') THEN
        SELECT array_agg(k ORDER BY k) INTO v_key_cols FROM jsonb_object_keys(v_key) AS k;
        IF v_key_cols IS NULL OR v_key_cols IS DISTINCT FROM v_sorted_pk_cols THEN
            RAISE EXCEPTION 'key must contain exactly the primary-key columns' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_operation IN ('insert', 'update') THEN
        SELECT array_agg(k ORDER BY k) INTO v_value_cols FROM jsonb_object_keys(v_values) AS k;
        IF v_value_cols IS NULL OR cardinality(v_value_cols) = 0 THEN
            RAISE EXCEPTION 'values must contain at least one column' USING ERRCODE = '22023';
        END IF;

        FOREACH v_col IN ARRAY v_value_cols LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute a
                WHERE a.attrelid = v_relation_oid
                  AND a.attname = v_col
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                  AND a.attgenerated = ''
                  AND a.attidentity = ''
            ) THEN
                RAISE EXCEPTION 'column % is not writable', v_col USING ERRCODE = '42703';
            END IF;
            IF v_operation = 'update' AND v_col = ANY(v_pk_cols) THEN
                RAISE EXCEPTION 'primary-key columns cannot be updated' USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;

    SELECT string_agg(format('t.%1$I IS NOT DISTINCT FROM k.%1$I', c), ' AND ')
    INTO v_where_clause
    FROM unnest(v_pk_cols) AS c;

    IF v_operation = 'insert' THEN
        SELECT string_agg(format('%I', c), ', '),
               string_agg(format('r.%I', c), ', ')
        INTO v_col_list, v_select_cols
        FROM unnest(v_value_cols) AS c;

        v_sql := format(
            'INSERT INTO %I.%I AS t (%s) SELECT %s FROM jsonb_populate_record(NULL::%I.%I, $1) AS r RETURNING to_jsonb(t.*)',
            v_schema, v_relation, v_col_list, v_select_cols, v_schema, v_relation
        );
        EXECUTE v_sql INTO v_after USING v_values;

        FOREACH v_col IN ARRAY v_pk_cols LOOP
            v_target_key := v_target_key || jsonb_build_object(v_col, v_after->v_col);
        END LOOP;
    ELSE
        v_sql := format(
            'SELECT to_jsonb(t.*) FROM %I.%I AS t, jsonb_populate_record(NULL::%I.%I, $1) AS k WHERE %s',
            v_schema, v_relation, v_schema, v_relation, v_where_clause
        );
        EXECUTE v_sql INTO v_before USING v_key;
        IF v_before IS NULL THEN
            RAISE EXCEPTION 'target row was not found' USING ERRCODE = 'P0002';
        END IF;
        v_target_key := v_key;

        IF v_operation = 'update' THEN
            SELECT string_agg(format('%1$I = r.%1$I', c), ', ')
            INTO v_set_clause
            FROM unnest(v_value_cols) AS c;

            v_sql := format(
                'UPDATE %I.%I AS t SET %s FROM jsonb_populate_record(NULL::%I.%I, $1) AS r, jsonb_populate_record(NULL::%I.%I, $2) AS k WHERE %s RETURNING to_jsonb(t.*)',
                v_schema, v_relation, v_set_clause, v_schema, v_relation, v_schema, v_relation, v_where_clause
            );
            EXECUTE v_sql INTO v_after USING v_values, v_key;
        ELSE
            v_sql := format(
                'DELETE FROM %I.%I AS t USING jsonb_populate_record(NULL::%I.%I, $1) AS k WHERE %s RETURNING to_jsonb(t.*)',
                v_schema, v_relation, v_schema, v_relation, v_where_clause
            );
            EXECUTE v_sql INTO v_before USING v_key;
            v_after := NULL;
        END IF;
    END IF;

    INSERT INTO public.operator_console_mutation_audit (
        request_id, actor, operation, target_schema, target_relation, target_key,
        before_row, after_row, provenance, succeeded
    ) VALUES (
        v_request_id, v_actor, v_operation, v_schema, v_relation, v_target_key,
        v_before, v_after, v_provenance, true
    );

    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'requestId', v_request_id,
        'row', COALESCE(v_after, v_before)
    );
EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_code = RETURNED_SQLSTATE, v_error_message = MESSAGE_TEXT;
    BEGIN
        INSERT INTO public.operator_console_mutation_audit (
            request_id, actor, operation, target_schema, target_relation, target_key,
            provenance, succeeded, error_code, error_message
        ) VALUES (
            v_request_id,
            COALESCE(NULLIF(v_actor, ''), 'unknown'),
            NULLIF(v_operation, ''),
            NULLIF(v_schema, ''),
            NULLIF(v_relation, ''),
            NULLIF(v_key, '{}'::jsonb),
            COALESCE(v_provenance, '{}'::jsonb),
            false,
            v_error_code,
            v_error_message
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE;
    END;

    RETURN jsonb_build_object(
        'success', false,
        'requestId', v_request_id,
        'errorCode', v_error_code,
        'errorMessage', v_error_message
    );
END;
$$;

REVOKE ALL ON FUNCTION public.operator_console_apply_mutation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_apply_mutation(jsonb) TO service_role;

COMMENT ON TABLE public.operator_console_relation_registry IS
    'Governed allowlist for Operator Console discovery and administrative operations.';
COMMENT ON TABLE public.operator_console_verification_records IS
    'Non-sensitive OC-002 verification-only records. is_test_data is constrained true.';
COMMENT ON TABLE public.operator_console_mutation_audit IS
    'Append-only audit evidence for Operator Console administrative mutation attempts.';
COMMENT ON FUNCTION public.operator_console_schema_metadata() IS
    'Returns only registry-approved browser-readable relational metadata. Execute is restricted to service_role.';
COMMENT ON FUNCTION public.operator_console_apply_mutation(jsonb) IS
    'Applies registry-governed public-schema mutations atomically with append-only audit evidence. Execute is restricted to service_role.';

COMMIT;
