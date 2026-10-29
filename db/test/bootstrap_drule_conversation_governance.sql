CREATE SCHEMA IF NOT EXISTS comind;

CREATE TABLE IF NOT EXISTS comind.cm_conversation (
  conv_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  project_id uuid,
  source text NOT NULL DEFAULT 'test',
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
