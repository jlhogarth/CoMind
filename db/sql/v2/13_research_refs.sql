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

INSERT INTO comind.cm_research_refs (title, url, notes, tags) VALUES
('Postgres RLS Best Practices', 'https://www.crunchydata.com/blog/postgres-row-level-security', 'RLS overview and patterns', ARRAY['security','RLS'])
ON CONFLICT DO NOTHING;

COMMIT;