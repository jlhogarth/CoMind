-- CoMind One-Shot Version 001 - 13_research_refs.sql
BEGIN;
SET search_path TO comind, public;

CREATE TABLE IF NOT EXISTS comind.cm_research_refs (
  ref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  notes TEXT,
  tags TEXT[],
  publisher TEXT,
  document_identifier TEXT,
  source_kind TEXT NOT NULL DEFAULT 'web_reference'
    CHECK (source_kind IN ('standard','framework','profile','playbook','guidance','draft','paper','report','documentation','web_reference','repository','policy','other')),
  authority_level TEXT NOT NULL DEFAULT 'unverified'
    CHECK (authority_level IN ('official_standard','primary_authoritative','secondary_guidance','internal_canonical','community','unverified')),
  lifecycle_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (lifecycle_status IN ('candidate','current','superseded','withdrawn','retired','historical','rejected')),
  version_label TEXT,
  published_on DATE,
  drive_file_id TEXT,
  drive_url TEXT,
  drive_folder_id TEXT,
  mime_type TEXT,
  byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
  content_sha256 CHAR(64) CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  observed_fingerprint TEXT,
  fingerprint_algorithm TEXT,
  ingested_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  freshness_due_at TIMESTAMPTZ,
  superseded_by_ref_id UUID REFERENCES comind.cm_research_refs(ref_id),
  research_session_id UUID,
  source_link_id UUID,
  related_capabilities TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cm_research_refs_supersession_self_ck
    CHECK (superseded_by_ref_id IS NULL OR superseded_by_ref_id <> ref_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_research_refs_drive_file_uidx
  ON comind.cm_research_refs(drive_file_id)
  WHERE drive_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_refs_document_identifier_idx
  ON comind.cm_research_refs(document_identifier)
  WHERE document_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_refs_lifecycle_idx
  ON comind.cm_research_refs(lifecycle_status, publisher, document_identifier);
CREATE INDEX IF NOT EXISTS cm_research_refs_content_sha256_idx
  ON comind.cm_research_refs(content_sha256)
  WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_refs_observed_fingerprint_idx
  ON comind.cm_research_refs(fingerprint_algorithm, observed_fingerprint)
  WHERE observed_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_research_refs_research_session_idx
  ON comind.cm_research_refs(research_session_id)
  WHERE research_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.set_updated_at_research_refs()
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

DROP TRIGGER IF EXISTS trg_cm_research_refs_updated ON comind.cm_research_refs;
CREATE TRIGGER trg_cm_research_refs_updated
BEFORE UPDATE ON comind.cm_research_refs
FOR EACH ROW
EXECUTE FUNCTION comind.set_updated_at_research_refs();

CREATE TABLE IF NOT EXISTS comind.cm_learning_path (
  path_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  audience TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','retired')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_learning_path_item (
  path_id UUID NOT NULL REFERENCES comind.cm_learning_path(path_id),
  ref_id UUID NOT NULL REFERENCES comind.cm_research_refs(ref_id),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  section_title TEXT,
  rationale TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  learning_objectives TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (path_id, ref_id),
  UNIQUE (path_id, sequence_no)
);

CREATE OR REPLACE FUNCTION comind.set_updated_at_learning_path()
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

DROP TRIGGER IF EXISTS trg_cm_learning_path_updated ON comind.cm_learning_path;
CREATE TRIGGER trg_cm_learning_path_updated
BEFORE UPDATE ON comind.cm_learning_path
FOR EACH ROW
EXECUTE FUNCTION comind.set_updated_at_learning_path();

REVOKE ALL ON TABLE comind.cm_research_refs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_learning_path FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_learning_path_item FROM PUBLIC, anon, authenticated;

-- Legacy seed links remain candidates until explicitly reverified by the governed Research Library.
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

UPDATE comind.cm_research_refs
SET lifecycle_status = 'retired',
    metadata = metadata || jsonb_build_object(
      'retirement_reason', 'provider retired from current CoMind architecture',
      'retired_by', 'RLIB-001'
    )
WHERE url LIKE 'https://neon.tech/%';

COMMIT;