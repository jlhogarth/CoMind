-- CoMind One‑Shot v2 - 03_schema_graph_rag.sql
BEGIN;
SET search_path TO comind, public;

-- Generic document & chunk store
CREATE TABLE IF NOT EXISTS cm_doc (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE SET NULL,
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  title TEXT,
  source TEXT,             -- 'upload','web','chatgpt_export','note'
  source_ref TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_doc_chunk (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES cm_doc(doc_id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Embeddings (pgvector)
-- Adjust dimension if needed.
CREATE TABLE IF NOT EXISTS cm_embedding (
  emb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID REFERENCES cm_doc(doc_id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES cm_doc_chunk(chunk_id) ON DELETE CASCADE,
  model TEXT NOT NULL,           -- e.g., 'text-embedding-3-large'
  dims INT NOT NULL DEFAULT 1536,
  vec vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generic knowledge graph (non-causal)
CREATE TABLE IF NOT EXISTS cm_kg_node (
  kg_node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_kg_edge (
  kg_edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src UUID REFERENCES cm_kg_node(kg_node_id) ON DELETE CASCADE,
  dst UUID REFERENCES cm_kg_node(kg_node_id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL,
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;