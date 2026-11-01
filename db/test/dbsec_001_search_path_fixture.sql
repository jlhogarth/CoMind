CREATE SCHEMA IF NOT EXISTS comind;
CREATE SCHEMA IF NOT EXISTS comind_pm;

CREATE OR REPLACE FUNCTION comind.current_actor()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION comind.fn_belief_update_beta(
  p_belief_id uuid,
  p_obs_bool boolean,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(belief_id uuid, params jsonb, mean real)
LANGUAGE sql
AS $$ SELECT p_belief_id, '{}'::jsonb, 0.5::real $$;

CREATE OR REPLACE FUNCTION comind.fn_create_causal_node_from_memory(
  p_memory_id uuid,
  p_kind text,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT p_memory_id $$;

CREATE OR REPLACE FUNCTION comind.set_current_actor(p_actor uuid)
RETURNS void
LANGUAGE sql
AS $$ SELECT NULL::void $$;

CREATE OR REPLACE FUNCTION comind.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION comind.set_updated_at_checklist()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION comind_pm.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN RETURN NEW; END $$;
