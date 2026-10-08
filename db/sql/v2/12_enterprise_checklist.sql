-- CoMind One‑Shot Version 001 - 12_enterprise_checklist.sql
BEGIN;
SET search_path TO comind, public;

-- Table to track enterprise readiness items
CREATE TABLE IF NOT EXISTS comind.cm_enterprise_checklist (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item TEXT NOT NULL,
  effort_estimate TEXT,
  priority TEXT CHECK (priority IN ('Day-1 Critical','Day-2 Enhancement')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  config_checked BOOLEAN NOT NULL DEFAULT FALSE,
  migration_done BOOLEAN NOT NULL DEFAULT FALSE,
  test_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION comind.set_updated_at_checklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_enterprise_checklist_updated ON comind.cm_enterprise_checklist;
CREATE TRIGGER trg_cm_enterprise_checklist_updated
BEFORE UPDATE ON comind.cm_enterprise_checklist
FOR EACH ROW
EXECUTE FUNCTION comind.set_updated_at_checklist();

-- Seed outstanding 12 tasks at cut-off for Version 001
INSERT INTO comind.cm_enterprise_checklist (item, effort_estimate, priority) VALUES
('RLS hardening (FORCE RLS + fine-grained policies)', '1–2 days', 'Day-1 Critical'),
('Tenant session enforcement (app.current_tenant per connection)', '0.5 day', 'Day-1 Critical'),
('Neon Branching (ephemeral DBs in CI/CD)', '1–2 days', 'Day-1 Critical'),
('OpenTelemetry traces (Fastify + DB)', '2–3 days', 'Day-1 Critical'),
('Health endpoints & back-pressure (under-pressure)', '1 day', 'Day-1 Critical'),
('Security headers (Helmet + strict Content Security Policy)', '1–2 days', 'Day-1 Critical'),
('Vector index tuning (HNSW/IVFFlat benchmarks)', '2–3 days', 'Day-2 Enhancement'),
('Data retention workflows (retention_class + purge jobs)', '2–3 days', 'Day-1 Critical'),
('ChatGPT export parsers (versioned + fixtures)', '2 days', 'Day-1 Critical'),
('Causal DAG & probabilistic pipeline (DoWhy/EconML/pgmpy/ProbLog)', '1–2 weeks', 'Day-2 Enhancement'),
('Billing idempotency & reconciliation (Stripe)', '3–5 days', 'Day-1 Critical'),
('Org roles enforcement (owner/admin/member/viewer)', '2–3 days', 'Day-1 Critical');

COMMIT;