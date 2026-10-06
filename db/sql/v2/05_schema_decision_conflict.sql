-- CoMind One‑Shot v2 - 05_schema_decision_conflict.sql
BEGIN;
SET search_path TO comind, public;

-- Decision trees (influence diagrams style)
CREATE TABLE IF NOT EXISTS cm_decision_tree (
  tree_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_decision_node (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID REFERENCES cm_decision_tree(tree_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('decision','chance','utility')),
  label TEXT NOT NULL,
  params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_decision_edge (
  edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src UUID REFERENCES cm_decision_node(node_id) ON DELETE CASCADE,
  dst UUID REFERENCES cm_decision_node(node_id) ON DELETE CASCADE,
  label TEXT,
  probability REAL, -- only for chance edges
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conflict heatmap
CREATE TABLE IF NOT EXISTS cm_conflict_heatmap (
  heat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  entity_a UUID,
  entity_b UUID,
  score REAL NOT NULL, -- positive = synergy, negative = conflict
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;