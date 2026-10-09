-- CoMind One‑Shot v2 - 08_indexes_constraints.sql
BEGIN;
SET search_path TO comind, public;

-- Common indexes
CREATE INDEX IF NOT EXISTS idx_actor_org ON cm_actor(org_id);
CREATE INDEX IF NOT EXISTS idx_project_org ON cm_project(org_id);
CREATE INDEX IF NOT EXISTS idx_memory_project ON cm_memory_node(project_id);
CREATE INDEX IF NOT EXISTS idx_tag_name ON cm_tag(name);
CREATE INDEX IF NOT EXISTS idx_trait_name ON cm_trait(name);
CREATE INDEX IF NOT EXISTS idx_meta_state_name ON cm_meta_state_def(name);

-- Docs/chunks/embeddings
CREATE INDEX IF NOT EXISTS idx_doc_project ON cm_doc(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunk_doc_idx ON cm_doc_chunk(doc_id, idx);
CREATE INDEX IF NOT EXISTS idx_embedding_doc ON cm_embedding(doc_id);
CREATE INDEX IF NOT EXISTS idx_embedding_chunk ON cm_embedding(chunk_id);
CREATE INDEX IF NOT EXISTS idx_embedding_vec ON cm_embedding USING ivfflat (vec vector_cosine_ops) WITH (lists = 100);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conv_project ON cm_conversation(project_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON cm_message(conv_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv_created_desc ON cm_message(conv_id, created_at DESC, msg_id DESC);
CREATE INDEX IF NOT EXISTS idx_msg_content_trgm ON cm_message USING gin (content gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_generation_active_conv
  ON cm_assistant_generation(conv_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_generation_claimed_user
  ON cm_assistant_generation(user_msg_id)
  WHERE status IN ('active','completed');
CREATE INDEX IF NOT EXISTS idx_assistant_generation_conv_user_status
  ON cm_assistant_generation(conv_id, user_msg_id, status);

-- Agents / tasks
CREATE INDEX IF NOT EXISTS idx_agent_org ON cm_agent(org_id);
CREATE INDEX IF NOT EXISTS idx_task_project ON cm_task(project_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON cm_task(status);

-- Causal graph
CREATE INDEX IF NOT EXISTS idx_causal_src ON cm_causal_edge(src_node);
CREATE INDEX IF NOT EXISTS idx_causal_dst ON cm_causal_edge(dst_node);
CREATE INDEX IF NOT EXISTS idx_belief_node ON cm_belief_state(node_id);

COMMIT;