-- CoMind One‑Shot v2 - 09_functions_triggers.sql
BEGIN;
SET search_path TO comind, public;

-- Updated-at trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Beta-Bernoulli belief update
CREATE OR REPLACE FUNCTION fn_belief_update_beta(p_belief_id UUID, p_obs_bool BOOLEAN, p_evidence JSONB DEFAULT '{}')
RETURNS TABLE (belief_id UUID, params JSONB, mean REAL) AS $$
DECLARE
  v_alpha NUMERIC;
  v_beta  NUMERIC;
  v_params JSONB;
  v_new_params JSONB;
  v_delta JSONB;
BEGIN
  SELECT params INTO v_params FROM cm_belief_state WHERE belief_id = p_belief_id FOR UPDATE;
  IF v_params IS NULL THEN
    RAISE EXCEPTION 'Belief % not found', p_belief_id;
  END IF;

  v_alpha := COALESCE( (v_params->>'alpha')::NUMERIC, 1 );
  v_beta  := COALESCE( (v_params->>'beta')::NUMERIC, 1 );

  IF p_obs_bool THEN
    v_alpha := v_alpha + 1;
  ELSE
    v_beta := v_beta + 1;
  END IF;

  v_new_params := jsonb_build_object('alpha', v_alpha, 'beta', v_beta);

  UPDATE cm_belief_state
     SET params = v_new_params,
         last_updated = now()
   WHERE belief_id = p_belief_id;

  v_delta := jsonb_build_object('alpha_delta', CASE WHEN p_obs_bool THEN 1 ELSE 0 END,
                                'beta_delta',  CASE WHEN p_obs_bool THEN 0 ELSE 1 END);

  INSERT INTO cm_belief_update_log (belief_id, evidence, delta)
  VALUES (p_belief_id, p_evidence, v_delta);

  RETURN QUERY
    SELECT p_belief_id,
           v_new_params,
           (v_alpha::REAL) / (v_alpha::REAL + v_beta::REAL) AS mean;
END;
$$ LANGUAGE plpgsql;

-- Convenience: create causal node from memory
CREATE OR REPLACE FUNCTION fn_create_causal_node_from_memory(p_memory_id UUID, p_kind TEXT, p_title TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE
  v_node_id UUID := gen_random_uuid();
  v_title TEXT;
BEGIN
  IF p_title IS NULL THEN
    SELECT COALESCE(title, 'Untitled') INTO v_title FROM cm_memory_node WHERE memory_id = p_memory_id;
  ELSE
    v_title := p_title;
  END IF;

  INSERT INTO cm_causal_node (node_id, memory_id, title, kind, description)
  SELECT v_node_id, p_memory_id, v_title, p_kind, content
  FROM cm_memory_node WHERE memory_id = p_memory_id;

  RETURN v_node_id;
END;
$$ LANGUAGE plpgsql;

-- Session-scoped current actor for RLS
CREATE OR REPLACE FUNCTION set_current_actor(p_actor UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('comind.current_actor', p_actor::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_actor() RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('comind.current_actor', true), '')::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;