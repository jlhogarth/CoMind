-- CoMind One‑Shot v2 - 04_schema_agents_tasks.sql
BEGIN;
SET search_path TO comind, public;

-- Agents and runs
CREATE TABLE IF NOT EXISTS cm_agent (
  agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES cm_org(org_id) ON DELETE SET NULL,
  name CITEXT UNIQUE NOT NULL,
  description TEXT,
  config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_agent_run (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES cm_agent(agent_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','canceled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cm_agent_step (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES cm_agent_run(run_id) ON DELETE CASCADE,
  name TEXT,
  input JSONB,
  output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_tool_call (
  tool_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES cm_agent_step(step_id) ON DELETE CASCADE,
  tool_name TEXT,
  arguments JSONB,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_error_event (
  error_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks & Planning
CREATE TABLE IF NOT EXISTS cm_task (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  priority INTEGER NOT NULL DEFAULT 5,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_task_link (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  src_task UUID REFERENCES cm_task(task_id) ON DELETE CASCADE,
  dst_task UUID REFERENCES cm_task(task_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('depends_on','relates_to','blocks')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_checklist_item (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES cm_task(task_id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_milestone (
  milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cm_project(project_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;