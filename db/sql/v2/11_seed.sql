-- CoMind One‑Shot v2 - 11_seed.sql
BEGIN;
SET search_path TO comind, public;

-- Org & Owner
INSERT INTO cm_org (name, slug) VALUES ('CoMind, Inc.', 'comind') ON CONFLICT DO NOTHING;
WITH o AS (SELECT org_id FROM cm_org WHERE slug='comind' LIMIT 1)
INSERT INTO cm_actor (org_id, kind, handle, display_name, email, meta)
SELECT o.org_id, 'person', 'joseph.hogarth', 'Joseph Hogarth', NULL, '{"role":"owner"}'
FROM o
ON CONFLICT (handle) DO NOTHING;

-- Project: CoMind
WITH o AS (SELECT org_id FROM cm_org WHERE slug='comind' LIMIT 1),
     a AS (SELECT actor_id FROM cm_actor WHERE handle='joseph.hogarth' LIMIT 1)
INSERT INTO cm_project (org_id, title, slug, description, priority, created_by)
SELECT o.org_id, 'CoMind', 'comind', 'Primary CoMind Project', 10, a.actor_id
FROM o,a
ON CONFLICT (slug) DO NOTHING;

-- Traits
INSERT INTO cm_trait (name, description) VALUES
  ('ThreadKeeper','Continuity engine ensuring coherence and approvals'),
  ('Signal Fidelity','Assesses evidence quality and assumptions'),
  ('Assumption Validator','Surfaces and tests hidden premises')
ON CONFLICT (name) DO NOTHING;

-- Module registry
INSERT INTO cm_module_registry (name, description, status, config) VALUES
  ('SET Tier','Superhuman Emulation Tier', 'enabled','{}'),
  ('Legacy Beacon','Long-range ethical foresight based on 7th Gen Principle','enabled','{}'),
  ('Future Continuity','Continuity projection & IP safeguards','enabled','{}'),
  ('SOAP','Symbolic SOAP scaffold','enabled','{}'),
  ('Causal-Probabilistic Scaffold','Causal nodes + beliefs + ILP Layer-0 + Neuro-Symbolic Bridge','enabled','{}')
ON CONFLICT (name) DO NOTHING;

-- CRIS tiers/theories
INSERT INTO cm_cris_tier (name, description) VALUES
  ('Perception','Input & grounding layer'),
  ('Symbolic','Rules, tags, causal graphs'),
  ('Executive','Planning & decision layer'),
  ('Reflective','Meta-cognition & audit')
ON CONFLICT (name) DO NOTHING;

INSERT INTO cm_cris_theory (name, description) VALUES
  ('IIT','Integrated Information Theory'),
  ('GWT','Global Workspace Theory'),
  ('HOT','Higher-Order Thought'),
  ('Damasio','Somatic marker hypothesis'),
  ('Seth','Predictive processing variant')
ON CONFLICT (name) DO NOTHING;

COMMIT;