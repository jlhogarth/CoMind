#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('Operator Console verification requires a PostgreSQL URL.', file=sys.stderr)
    sys.exit(1)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing Operator Console verification outside isolated comind_ci PostgreSQL.', file=sys.stderr)
    sys.exit(1)
PY

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="${repo_root}/db/migrations/20261015_001_operator_console_live_activation.sql"
hardening="${repo_root}/db/migrations/20261015_002_operator_console_service_role_least_privilege.sql"
verification="${repo_root}/db/migrations/verify_20261015_001_operator_console_live_activation.sql"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
    ELSE
        ALTER ROLE service_role BYPASSRLS;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.users (
    id uuid PRIMARY KEY,
    display_name text NOT NULL,
    bio text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posts (
    id uuid PRIMARY KEY,
    author_id uuid NOT NULL REFERENCES public.users(id),
    title text NOT NULL,
    slug text NOT NULL UNIQUE,
    excerpt text,
    body text NOT NULL,
    published boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY,
    post_id uuid NOT NULL REFERENCES public.posts(id),
    author_id uuid NOT NULL REFERENCES public.users(id),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.users, public.posts, public.comments TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can read author profiles" ON public.users;
CREATE POLICY "Public can read author profiles"
ON public.users FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read published posts" ON public.posts;
CREATE POLICY "Public can read published posts"
ON public.posts FOR SELECT TO anon, authenticated USING (published = true);

DROP POLICY IF EXISTS "Public can read comments on published posts" ON public.comments;
CREATE POLICY "Public can read comments on published posts"
ON public.comments FOR SELECT TO anon, authenticated
USING (EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = comments.post_id AND p.published = true
));

INSERT INTO public.users (id, display_name, bio)
VALUES ('00000000-0000-0000-0000-000000000101', 'OC-002 Fixture Author', 'Synthetic isolated verification fixture')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.posts (id, author_id, title, slug, body, published)
VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Published fixture', 'oc002-published-fixture', 'Published body', true),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Private fixture', 'oc002-private-fixture', 'Private body', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comments (id, post_id, author_id, body)
VALUES
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Published comment'),
    ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Private comment')
ON CONFLICT (id) DO NOTHING;
SQL

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"

# Supabase production applies default table privileges that grant service_role ALL
# on newly created public tables. Reproduce that live-only condition before the
# compensating migration so isolated verification can detect privilege drift.
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL ON TABLE public.operator_console_relation_registry TO service_role;
GRANT ALL ON TABLE public.operator_console_verification_records TO service_role;
GRANT ALL ON TABLE public.operator_console_mutation_audit TO service_role;
SQL

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${hardening}"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${hardening}"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${verification}"

anon_counts="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT
    (SELECT count(*) FROM public.users),
    (SELECT count(*) FROM public.posts),
    (SELECT count(*) FROM public.comments);
ROLLBACK;
SQL
)"

if [[ "${anon_counts}" != *$'1|1|1'* ]]; then
    printf 'Unexpected anon RLS counts: %s\n' "${anon_counts}" >&2
    exit 1
fi

if psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.users (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000199', 'Unauthorized browser write');
ROLLBACK;
SQL
then
    echo 'Anon write unexpectedly succeeded.' >&2
    exit 1
fi

if psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE anon;
SELECT public.operator_console_schema_metadata();
ROLLBACK;
SQL
then
    echo 'Anon metadata RPC unexpectedly succeeded.' >&2
    exit 1
fi

if psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
TRUNCATE TABLE public.operator_console_mutation_audit;
ROLLBACK;
SQL
then
    echo 'service_role TRUNCATE on append-only audit unexpectedly succeeded.' >&2
    exit 1
fi

service_metadata_count="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN;
SET LOCAL ROLE service_role;
SELECT jsonb_array_length(public.operator_console_schema_metadata()->'relations');
ROLLBACK;
SQL
)"

if [[ "${service_metadata_count}" != *$'3'* ]]; then
    printf 'Unexpected service_role metadata relation count: %s\n' "${service_metadata_count}" >&2
    exit 1
fi

printf 'Operator Console OC-002 isolated PostgreSQL verification passed.\n'
