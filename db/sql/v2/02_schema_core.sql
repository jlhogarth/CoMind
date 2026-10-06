-- CoMind One‑Shot v2 - 02_schema_core.sql
BEGIN;
CREATE SCHEMA IF NOT EXISTS comind;
SET search_path TO comind, public;

-- Organizations & Accounts (Company layer)
CREATE TABLE IF NOT EXISTS cm_org (
  org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  slug CITEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_actor (
  actor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('person','agent','service')),
  handle CITEXT UNIQUE,
  display_name TEXT,
  email CITEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_org_member (
  org_id UUID REFERENCES cm_org(org_id) ON DELETE CASCADE,
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, actor_id)
);

-- Billing (minimal scaffold)
CREATE TABLE IF NOT EXISTS cm_billing_plan (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CITEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  features JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_billing_subscription (
  sub_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE CASCADE,
  plan_id UUID REFERENCES cm_billing_plan(plan_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ
);

-- Projects
CREATE TABLE IF NOT EXISTS cm_project (
  project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug CITEXT UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  priority INTEGER NOT NULL DEFAULT 5,
  meta JSONB,
  created_by UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memory
CREATE TABLE IF NOT EXISTS cm_memory_node (
  memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  author_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  subtype TEXT,
  content TEXT,
  json_payload JSONB,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  weight REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','public','private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cm_tag (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_memory_tag (
  memory_id UUID REFERENCES cm_memory_node(memory_id) ON DELETE CASCADE,
  tag_id UUID REFERENCES cm_tag(tag_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (memory_id, tag_id)
);

CREATE TABLE IF NOT EXISTS cm_trait (
  trait_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_actor_trait (
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE CASCADE,
  trait_id UUID REFERENCES cm_trait(trait_id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, trait_id)
);

-- Meta-States
CREATE TABLE IF NOT EXISTS cm_meta_state_def (
  meta_state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  schema JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_meta_state_instance (
  instance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_state_id UUID REFERENCES cm_meta_state_def(meta_state_id) ON DELETE CASCADE,
  subject_memory_id UUID REFERENCES cm_memory_node(memory_id) ON DELETE SET NULL,
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  state JSONB NOT NULL,
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidence & Files
CREATE TABLE IF NOT EXISTS cm_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  source_type TEXT,
  source_ref TEXT,
  checksum TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_file_asset (
  file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES cm_memory_node(memory_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_ref TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Policies, Integration, Journal
CREATE TABLE IF NOT EXISTS cm_policy_rule (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  text TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_integration_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  details TEXT,
  tags TEXT[],
  linked_memory_ids UUID[],
  created_by UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_journal_entry (
  journal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  author_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  tags TEXT[],
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SOAP
CREATE TABLE IF NOT EXISTS cm_soap_case (
  case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  context JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','closed')),
  created_by UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_soap_entry (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cm_soap_case(case_id) ON DELETE CASCADE,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  tags TEXT[],
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Module registry
CREATE TABLE IF NOT EXISTS cm_module_registry (
  module_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRIS
CREATE TABLE IF NOT EXISTS cm_cris_theory (
  theory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  references JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_cris_tier (
  tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_cris_mapping (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theory_id UUID REFERENCES cm_cris_theory(theory_id) ON DELETE CASCADE,
  tier_id UUID REFERENCES cm_cris_tier(tier_id) ON DELETE CASCADE,
  mapping JSONB,
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;