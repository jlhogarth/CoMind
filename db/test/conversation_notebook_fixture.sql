-- Disposable PostgreSQL 17 fixture only. Loaded by scripts/test_conversation_lifecycle.sh.
-- This schema is never installed by db/sql/v2 or db/migrations.
-- Notebook stores intake, candidate findings, evidence, review, and a link to the
-- canonical project memory row. It does not create a second durable memory table.

DROP SCHEMA IF EXISTS comind_notebook CASCADE;
CREATE SCHEMA comind_notebook;

CREATE TABLE comind_notebook.source_records (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'project')),
  project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
  source_conversation_id UUID REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  captured_by UUID NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('paste', 'text_file', 'synthetic')),
  source_ref TEXT,
  raw_text TEXT NOT NULL CHECK (length(raw_text) > 0),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, project_id),
  UNIQUE NULLS NOT DISTINCT (scope, project_id, content_sha256),
  CHECK ((scope = 'personal' AND project_id IS NULL)
      OR (scope = 'project' AND project_id IS NOT NULL)),
  CHECK ((scope = 'personal' AND source_conversation_id IS NULL)
      OR (scope = 'project' AND source_conversation_id IS NOT NULL))
);

CREATE TABLE comind_notebook.findings (
  finding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  project_id UUID,
  source_message_id UUID REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('decision', 'action', 'preference', 'question', 'insight', 'commitment')),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  extractor_version TEXT NOT NULL CHECK (length(btrim(extractor_version)) > 0),
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  destination TEXT CHECK (destination IN ('personal_local', 'project_memory')),
  memory_id UUID REFERENCES comind.cm_memory_node(memory_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, finding_id),
  UNIQUE NULLS NOT DISTINCT (source_id, source_message_id, extractor_version, kind, content_sha256),
  FOREIGN KEY (source_id, project_id)
    REFERENCES comind_notebook.source_records(source_id, project_id) ON DELETE RESTRICT,
  CHECK ((status = 'candidate' AND destination IS NULL AND memory_id IS NULL)
      OR (status = 'rejected' AND destination IS NULL AND memory_id IS NULL)
      OR (status = 'approved' AND destination = 'personal_local' AND project_id IS NULL AND memory_id IS NULL)
      OR (status = 'approved' AND destination = 'project_memory' AND project_id IS NOT NULL
          AND source_message_id IS NOT NULL AND memory_id IS NOT NULL))
);

CREATE TABLE comind_notebook.evidence_spans (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  finding_id UUID NOT NULL,
  start_char INTEGER NOT NULL CHECK (start_char >= 0),
  end_char INTEGER NOT NULL CHECK (end_char > start_char),
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  excerpt TEXT NOT NULL CHECK (length(excerpt) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finding_id, start_char, end_char),
  FOREIGN KEY (source_id, finding_id)
    REFERENCES comind_notebook.findings(source_id, finding_id) ON DELETE RESTRICT
);

CREATE TABLE comind_notebook.review_events (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL UNIQUE REFERENCES comind_notebook.findings(finding_id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  destination TEXT CHECK (destination IN ('personal_local', 'project_memory')),
  memory_id UUID REFERENCES comind.cm_memory_node(memory_id) ON DELETE RESTRICT,
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((decision = 'reject' AND destination IS NULL AND memory_id IS NULL)
      OR (decision = 'approve' AND destination = 'personal_local' AND memory_id IS NULL)
      OR (decision = 'approve' AND destination = 'project_memory' AND memory_id IS NOT NULL))
);

CREATE INDEX source_records_project_captured_idx
  ON comind_notebook.source_records(project_id, captured_at DESC);
CREATE INDEX findings_source_status_idx
  ON comind_notebook.findings(source_id, status, created_at);
CREATE INDEX findings_project_memory_idx
  ON comind_notebook.findings(project_id, memory_id)
  WHERE destination = 'project_memory';
CREATE INDEX evidence_finding_idx
  ON comind_notebook.evidence_spans(source_id, finding_id, line_number);

CREATE FUNCTION comind_notebook.prevent_review_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Notebook review events are append-only';
END;
$$;

CREATE TRIGGER review_events_no_update
BEFORE UPDATE OR DELETE ON comind_notebook.review_events
FOR EACH ROW EXECUTE FUNCTION comind_notebook.prevent_review_event_mutation();

CREATE TRIGGER source_records_no_update
BEFORE UPDATE OR DELETE ON comind_notebook.source_records
FOR EACH ROW EXECUTE FUNCTION comind_notebook.prevent_review_event_mutation();

CREATE TRIGGER evidence_spans_no_update
BEFORE UPDATE OR DELETE ON comind_notebook.evidence_spans
FOR EACH ROW EXECUTE FUNCTION comind_notebook.prevent_review_event_mutation();

CREATE FUNCTION comind_notebook.validate_source_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scope = 'project' AND NOT EXISTS (
    SELECT 1 FROM comind.cm_conversation c
    WHERE c.conv_id = NEW.source_conversation_id AND c.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Source conversation is outside the canonical project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER source_records_project_scope
BEFORE INSERT ON comind_notebook.source_records
FOR EACH ROW EXECUTE FUNCTION comind_notebook.validate_source_scope();

CREATE FUNCTION comind_notebook.guard_finding_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'candidate'
     OR NEW.status NOT IN ('approved', 'rejected')
     OR NEW.finding_id IS DISTINCT FROM OLD.finding_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.source_message_id IS DISTINCT FROM OLD.source_message_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
     OR NEW.extractor_version IS DISTINCT FROM OLD.extractor_version
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Finding transition is unavailable or changes immutable evidence';
  END IF;
  IF NEW.destination = 'project_memory' AND NOT EXISTS (
    SELECT 1 FROM comind.cm_memory_node m
    WHERE m.memory_id = NEW.memory_id AND m.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Project approval must link memory in the finding project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER findings_review_transition_only
BEFORE UPDATE ON comind_notebook.findings
FOR EACH ROW EXECUTE FUNCTION comind_notebook.guard_finding_transition();

CREATE FUNCTION comind_notebook.validate_finding_source_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM comind.cm_message m
    JOIN comind.cm_conversation c ON c.conv_id = m.conv_id
    JOIN comind_notebook.source_records s ON s.source_id = NEW.source_id
    WHERE m.msg_id = NEW.source_message_id
      AND c.project_id = NEW.project_id
      AND c.conv_id = s.source_conversation_id
  ) THEN
    RAISE EXCEPTION 'Finding source message is outside the canonical project';
  END IF;
  IF NEW.project_id IS NULL AND NEW.source_message_id IS NOT NULL THEN
    RAISE EXCEPTION 'Personal findings do not link into a CoMind project conversation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER findings_source_scope
BEFORE INSERT OR UPDATE ON comind_notebook.findings
FOR EACH ROW EXECUTE FUNCTION comind_notebook.validate_finding_source_scope();

CREATE FUNCTION comind_notebook.validate_exact_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw_text TEXT;
  v_line_number INTEGER;
BEGIN
  SELECT raw_text INTO v_raw_text
  FROM comind_notebook.source_records
  WHERE source_id = NEW.source_id;
  IF v_raw_text IS NULL
     OR NEW.end_char > char_length(v_raw_text)
     OR substring(v_raw_text FROM NEW.start_char + 1 FOR NEW.end_char - NEW.start_char) <> NEW.excerpt THEN
    RAISE EXCEPTION 'Evidence excerpt does not match its exact source span';
  END IF;
  v_line_number := 1 + char_length(substring(v_raw_text FROM 1 FOR NEW.start_char))
                    - char_length(replace(substring(v_raw_text FROM 1 FOR NEW.start_char), E'\n', ''));
  IF v_line_number <> NEW.line_number THEN
    RAISE EXCEPTION 'Evidence line number does not match its source offset';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_exact_source_span
BEFORE INSERT OR UPDATE ON comind_notebook.evidence_spans
FOR EACH ROW EXECUTE FUNCTION comind_notebook.validate_exact_evidence();

COMMENT ON SCHEMA comind_notebook IS
  'Disposable Test fixture for Notebook intake and human review. Not a production migration or durable memory authority.';
