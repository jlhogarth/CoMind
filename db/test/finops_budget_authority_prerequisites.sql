-- Isolated PostgreSQL fixture for the legacy FinOps v1 dependency contract.
-- This file is test-only. It does not model production data or current runtime wiring.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.comind_governance_decisions (
    id BIGSERIAL PRIMARY KEY,
    triad_nodes_invoked TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    issue_type TEXT NOT NULL,
    issue_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    decision TEXT NOT NULL,
    rationale TEXT NOT NULL,
    downstream_actions JSONB NOT NULL DEFAULT '[]'::jsonb
);
