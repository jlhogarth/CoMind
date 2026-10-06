-- CoMind One‑Shot Version 001 - 13_research_refs.sql
BEGIN;
SET search_path TO comind, public;

CREATE TABLE IF NOT EXISTS comind.cm_research_refs (
  ref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION comind.set_updated_at_research_refs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cm_research_refs_updated ON comind.cm_research_refs;
CREATE TRIGGER trg_cm_research_refs_updated
BEFORE UPDATE ON comind.cm_research_refs
FOR EACH ROW
EXECUTE FUNCTION comind.set_updated_at_research_refs();

-- Seed deep research links
INSERT INTO comind.cm_research_refs (title, url, notes, tags) VALUES
('Postgres RLS Best Practices', 'https://www.crunchydata.com/blog/postgres-row-level-security', 'RLS overview and patterns', ARRAY['security','RLS']),
('Neon Branching Docs', 'https://neon.tech/docs/manage/branches', 'Ephemeral branches for CI/CD', ARRAY['neon','devops']),
('Neon Connection Pooling (PgBouncer)', 'https://neon.tech/docs/connect/connection-pooling', 'Pooling guidance', ARRAY['neon','pooling']),
('pgvector (GitHub)', 'https://github.com/pgvector/pgvector', 'Vector indexes & tuning', ARRAY['vector','pgvector']),
('Fastify Helmet', 'https://github.com/fastify/fastify-helmet', 'Security headers & CSP', ARRAY['security','http']),
('Fastify OpenTelemetry', 'https://github.com/autotelic/fastify-opentelemetry', 'Tracing & metrics', ARRAY['observability','otel']),
('Fastify under-pressure', 'https://github.com/fastify/under-pressure', 'Back-pressure & health', ARRAY['resilience','ops']),
('Stripe Billing', 'https://stripe.com/docs/billing', 'Billing models & invoices', ARRAY['billing','stripe']),
('Stripe Idempotency Keys', 'https://stripe.com/docs/api/idempotent_requests', 'Safe retries for writes', ARRAY['billing','idempotency']),
('GDPR Article 5', 'https://gdpr-info.eu/art-5-gdpr/', 'Data minimization & purpose', ARRAY['compliance','gdpr']),
('NIST SP 800-122', 'https://csrc.nist.gov/publications/detail/sp/800-122/final', 'PII protection guidance', ARRAY['compliance','nist']),
('SOC 2 Overview (AICPA)', 'https://www.aicpa.org/resources/article/what-is-soc-2', 'SOC 2 foundations', ARRAY['compliance','soc2']),
('ChatGPT Export (community)', 'https://github.com/openai/openai-data-export', 'Export format reference', ARRAY['export','chatgpt']),
('DoWhy (PyWhy)', 'https://github.com/py-why/dowhy', 'Causal inference', ARRAY['causal']),
('EconML (Microsoft)', 'https://github.com/microsoft/EconML', 'Heterogeneous treatment effects', ARRAY['causal','ml']),
('pgmpy', 'https://pgmpy.org/', 'Probabilistic graphical models', ARRAY['probabilistic']),
('ProbLog', 'https://dtai.cs.kuleuven.be/problog/', 'Probabilistic logic programming', ARRAY['ilp','logic']);

COMMIT;