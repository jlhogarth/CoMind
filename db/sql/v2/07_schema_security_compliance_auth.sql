-- CoMind One‑Shot v2 - 07_schema_security_compliance_auth.sql
BEGIN;
SET search_path TO comind, public;

-- Security & Compliance
CREATE TABLE IF NOT EXISTS cm_retention_policy (
  rp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  rules JSONB,                         -- e.g., durations per table/tag
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_retention_binding (
  rb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rp_id UUID REFERENCES cm_retention_policy(rp_id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_id UUID,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_data_access_log (
  dal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  action TEXT,
  table_name TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auth/Identity/API Keys
CREATE TABLE IF NOT EXISTS cm_identity_provider (
  idp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name CITEXT UNIQUE NOT NULL,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_identity (
  identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE CASCADE,
  idp_id UUID REFERENCES cm_identity_provider(idp_id) ON DELETE SET NULL,
  subject TEXT,          -- provider user id/email
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_api_key (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE CASCADE,
  name TEXT,
  hash TEXT NOT NULL,    -- store hash only
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cm_secret_ref (
  secret_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  provider TEXT,         -- 'vault', 'aws-sm', etc.
  ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit
CREATE TABLE IF NOT EXISTS cm_audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation Offloading (ChatGPT export etc.)
CREATE TABLE IF NOT EXISTS cm_conversation (
  conv_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE SET NULL,
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  owner_actor_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  source TEXT NOT NULL,                 -- 'chatgpt_export','live','import_api'
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_ref TEXT,                    -- path or export file id
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS cm_message (
  msg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id UUID REFERENCES cm_conversation(conv_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);

CREATE TABLE IF NOT EXISTS cm_assistant_generation (
  generation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id UUID NOT NULL REFERENCES cm_conversation(conv_id) ON DELETE CASCADE,
  user_msg_id UUID NOT NULL REFERENCES cm_message(msg_id) ON DELETE CASCADE,
  claim_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed')),
  assistant_msg_id UUID REFERENCES cm_message(msg_id) ON DELETE SET NULL,
  failure_code TEXT CHECK (failure_code IN ('provider_failure')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  CONSTRAINT cm_assistant_generation_terminal_state_check CHECK (
    (status = 'active'
      AND assistant_msg_id IS NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND failure_code IS NULL)
    OR
    (status = 'completed'
      AND assistant_msg_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND failed_at IS NULL
      AND failure_code IS NULL)
    OR
    (status = 'failed'
      AND assistant_msg_id IS NULL
      AND completed_at IS NULL
      AND failed_at IS NOT NULL
      AND failure_code IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS cm_message_attachment (
  attach_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id UUID REFERENCES cm_message(msg_id) ON DELETE CASCADE,
  kind TEXT,
  url TEXT,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS cm_message_analytics (
  ma_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id UUID REFERENCES cm_message(msg_id) ON DELETE CASCADE,
  token_count INTEGER,
  sentiment REAL,
  topics TEXT[],
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_conversation_analytics (
  ca_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id UUID REFERENCES cm_conversation(conv_id) ON DELETE CASCADE,
  summary TEXT,
  stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Causal/Probabilistic/ILP/NS (from scaffold)
CREATE TABLE IF NOT EXISTS cm_causal_node (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES cm_memory_node(memory_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('belief','observation','action','metric','meta-state')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_causal_edge (
  edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_node UUID REFERENCES cm_causal_node(node_id) ON DELETE CASCADE,
  dst_node UUID REFERENCES cm_causal_node(node_id) ON DELETE CASCADE,
  relation TEXT DEFAULT 'causes',
  strength REAL,
  assumptions JSONB,
  evidence_refs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_causal_intervention (
  iv_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES cm_causal_node(node_id) ON DELETE CASCADE,
  set_value JSONB,
  context JSONB,
  outcome JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_belief_state (
  belief_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES cm_causal_node(node_id) ON DELETE CASCADE,
  variable TEXT NOT NULL,
  model TEXT NOT NULL,
  params JSONB NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  provenance JSONB
);

CREATE TABLE IF NOT EXISTS cm_belief_update_log (
  upd_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  belief_id UUID REFERENCES cm_belief_state(belief_id) ON DELETE CASCADE,
  evidence JSONB,
  delta JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auditor TEXT DEFAULT 'ThreadKeeper'
);

CREATE TABLE IF NOT EXISTS cm_ilp_hypothesis (
  hyp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  rule_text TEXT,
  support INTEGER DEFAULT 0,
  counterevidence INTEGER DEFAULT 0,
  complexity REAL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_ilp_example (
  ex_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hyp_id UUID REFERENCES cm_ilp_hypothesis(hyp_id) ON DELETE CASCADE,
  is_positive BOOLEAN NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_ns_bridge (
  bridge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES cm_causal_node(node_id) ON DELETE CASCADE,
  vector_store_key TEXT,
  constraints JSONB,
  score REAL,
  last_sync TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;