-- CHIST-A03: deterministic Corpus Analytical Baseline substrate
-- Issue: https://github.com/jlhogarth/CoMind/issues/304
-- Scope: additive, certified Conversation History derived evidence only.
-- Raw archive evidence remains canonical. No promotion is performed here.

BEGIN;
SET search_path TO comind, public, extensions;

DO $$
BEGIN
  IF to_regclass('comind.cm_conversation_history_baseline') IS NULL
     OR to_regclass('comind.cm_archive_import') IS NULL
     OR to_regclass('comind.cm_archive_conversation_observation') IS NULL
     OR to_regclass('comind.cm_archive_node_observation') IS NULL
     OR to_regclass('comind.cm_archive_sessionization_run') IS NULL THEN
    RAISE EXCEPTION 'CHIST-A03 requires the accepted CHIST-001, CHIST-A01, and CHIST-A02 substrate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_reader')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_deriver') THEN
    RAISE EXCEPTION 'CHIST-A03 requires the governed Conversation History reader and deriver roles';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comind.cm_archive_analysis_policy (
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  engine_kind text NOT NULL CHECK (engine_kind IN ('deterministic','model_assisted')),
  evidence_layer text NOT NULL CHECK (evidence_layer='derived_analytical_evidence'),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_key,policy_version)
);

WITH p(policy_key,policy_version,engine_kind,evidence_layer,definition) AS (
  VALUES (
    'corpus_analytical_baseline','a03-v1','deterministic','derived_analytical_evidence',
    'Certified native Conversation History corpus baseline. Derives active versus alternate graph membership, governed lexical concept observations, actor-attributed concept summaries, and conversation-level concept co-occurrence bridges. Counts and lexical matches are evidence, not Digital Twin truth, recommendation, decision, or action authority.'
  )
)
INSERT INTO comind.cm_archive_analysis_policy(
  policy_key,policy_version,engine_kind,evidence_layer,definition,definition_sha256
)
SELECT policy_key,policy_version,engine_kind,evidence_layer,definition,
       encode(extensions.digest(concat_ws('|',policy_key,policy_version,engine_kind,evidence_layer,definition),'sha256'),'hex')
FROM p
ON CONFLICT (policy_key,policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_archive_analysis_run (
  analysis_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  baseline_id uuid NOT NULL REFERENCES comind.cm_conversation_history_baseline(baseline_id) ON DELETE RESTRICT,
  sessionization_run_id uuid REFERENCES comind.cm_archive_sessionization_run(sessionization_run_id) ON DELETE RESTRICT,
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  source_archive_sha256 char(64) NOT NULL CHECK (source_archive_sha256 ~ '^[a-f0-9]{64}$'),
  certification_sha256 char(64) NOT NULL CHECK (certification_sha256 ~ '^[a-f0-9]{64}$'),
  source_conversation_count bigint NOT NULL CHECK (source_conversation_count >= 0),
  source_node_count bigint NOT NULL CHECK (source_node_count >= 0),
  source_message_count bigint NOT NULL CHECK (source_message_count >= 0),
  source_attachment_reference_count bigint NOT NULL CHECK (source_attachment_reference_count >= 0),
  result_state text NOT NULL DEFAULT 'building' CHECK (result_state IN ('building','completed','partial','failed')),
  source_stats jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_stats)='object'),
  result_counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_counts)='object'),
  engine_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(engine_metadata)='object'),
  analysis_identity_sha256 char(64) NOT NULL UNIQUE CHECK (analysis_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT cm_archive_analysis_run_policy_fk
    FOREIGN KEY (policy_key,policy_version)
    REFERENCES comind.cm_archive_analysis_policy(policy_key,policy_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_analysis_run_terminal_time_ck CHECK (
    (result_state='building' AND completed_at IS NULL)
    OR (result_state<>'building' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_branch_membership (
  analysis_run_id uuid NOT NULL REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  source_message_id text,
  source_role text,
  source_created_at timestamptz,
  branch_state text NOT NULL CHECK (branch_state IN ('active','alternate')),
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence' CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'observed_fact' CHECK (epistemic_class='observed_fact'),
  membership_sha256 char(64) NOT NULL CHECK (membership_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (analysis_run_id,source_conversation_id,source_node_id),
  UNIQUE (analysis_run_id,membership_sha256),
  CONSTRAINT cm_archive_branch_membership_source_fk
    FOREIGN KEY (import_id,source_conversation_id,source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id,source_conversation_id,source_node_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_concept_definition (
  concept_key text NOT NULL,
  concept_version text NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  matcher_kind text NOT NULL CHECK (matcher_kind='postgres_regex'),
  match_pattern text NOT NULL CHECK (length(match_pattern) > 0),
  case_sensitive boolean NOT NULL DEFAULT false,
  ambiguity_class text NOT NULL CHECK (ambiguity_class IN ('low','contextual','high')),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (concept_key,concept_version)
);

WITH d(concept_key,label,match_pattern,case_sensitive,ambiguity_class,definition) AS (
  VALUES
    ('comind','CoMind','(^|[^[:alnum:]_])CoMind([^[:alnum:]_]|$)',false,'low','Named CoMind concept or platform reference.'),
    ('digital_twin','Digital Twin','(^|[^[:alnum:]_])Digital[[:space:]-]+Twins?([^[:alnum:]_]|$)',false,'contextual','Digital Twin concept reference; historical meaning must be interpreted temporally.'),
    ('threadkeeper','ThreadKeeper','(^|[^[:alnum:]_])ThreadKeeper([^[:alnum:]_]|$)',false,'low','Named ThreadKeeper concept reference.'),
    ('signal_fidelity','Signal Fidelity','(^|[^[:alnum:]_])Signal[[:space:]]+Fidelity([^[:alnum:]_]|$)',false,'contextual','Named or descriptive Signal Fidelity reference.'),
    ('continuity_watchdog','Continuity Watchdog','(^|[^[:alnum:]_])Continuity[[:space:]]+Watchdog([^[:alnum:]_]|$)',false,'low','Named Continuity Watchdog concept reference.'),
    ('foundationthought','FoundationThought','(^|[^[:alnum:]_])FoundationThought([^[:alnum:]_]|$)',false,'low','Named FoundationThought concept reference.'),
    ('neural_core','Neural Core','(^|[^[:alnum:]_])Neural[[:space:]]+Core([^[:alnum:]_]|$)',false,'contextual','Neural Core concept reference.'),
    ('algorithmic_layer','Algorithmic Layer','(^|[^[:alnum:]_])Algorithmic[[:space:]]+Layer([^[:alnum:]_]|$)',false,'contextual','Algorithmic Layer concept reference.'),
    ('legacy_beacon','Legacy Beacon','(^|[^[:alnum:]_])Legacy[[:space:]]+Beacon([^[:alnum:]_]|$)',false,'low','Named Legacy Beacon concept reference.'),
    ('future_continuity','Future Continuity','(^|[^[:alnum:]_])Future[[:space:]]+Continuity([^[:alnum:]_]|$)',false,'contextual','Future Continuity concept reference.'),
    ('cognitive_torque','Cognitive Torque','(^|[^[:alnum:]_])Cognitive[[:space:]]+Torque([^[:alnum:]_]|$)',false,'low','Named Cognitive Torque concept reference.'),
    ('seal','SEAL','(^|[^A-Za-z0-9_])SEAL([^A-Za-z0-9_]|$)',true,'high','Uppercase SEAL token. High ambiguity means semantic interpretation requires contextual review.'),
    ('soap','SOAP','(^|[^A-Za-z0-9_])SOAP([^A-Za-z0-9_]|$)',true,'high','Uppercase SOAP token. High ambiguity means semantic interpretation requires contextual review.'),
    ('cris','CRIS','(^|[^A-Za-z0-9_])CRIS([^A-Za-z0-9_]|$)',true,'contextual','Uppercase CRIS concept reference.'),
    ('aris','ARIS','(^|[^A-Za-z0-9_])ARIS([^A-Za-z0-9_]|$)',true,'contextual','Uppercase ARIS concept reference.'),
    ('gpc','GPC','(^|[^A-Za-z0-9_])GPC([^A-Za-z0-9_]|$)',true,'high','Uppercase GPC token. Semantic expansion requires contextual review.'),
    ('rpda','RPDA','(^|[^A-Za-z0-9_])RPDA([^A-Za-z0-9_]|$)',true,'contextual','Uppercase RPDA concept reference.'),
    ('mapt','MAPT','(^|[^A-Za-z0-9_])MAPT([^A-Za-z0-9_]|$)',true,'contextual','Uppercase MAPT concept reference.'),
    ('focusforge','FocusForge','(^|[^[:alnum:]_])FocusForge([^[:alnum:]_]|$)',false,'low','Named FocusForge concept reference.'),
    ('ptsd','PTSD','(^|[^A-Za-z0-9_])PTSD([^A-Za-z0-9_]|$)',true,'contextual','Uppercase PTSD project or subject reference. No medical inference is implied by lexical presence.'),
    ('semantic_compression','Semantic Compression','(^|[^[:alnum:]_])Semantic[[:space:]]+Compression([^[:alnum:]_]|$)',false,'contextual','Semantic Compression concept reference.'),
    ('agent_colony','Agent Colony','(^|[^[:alnum:]_])Agent[[:space:]]+Colon(y|ies)([^[:alnum:]_]|$)',false,'contextual','Agent Colony concept reference.'),
    ('assistant_galleries','Assistant Galleries','(^|[^[:alnum:]_])Assistant[[:space:]]+Galler(y|ies)([^[:alnum:]_]|$)',false,'contextual','Assistant Gallery or Galleries concept reference.'),
    ('cognitive_hardening','Cognitive Hardening','(^|[^[:alnum:]_])Cognitive[[:space:]]+Hardening([^[:alnum:]_]|$)',false,'contextual','Cognitive Hardening concept reference.'),
    ('virtual_employees','Virtual Employees','(^|[^[:alnum:]_])Virtual[[:space:]]+Employees?([^[:alnum:]_]|$)',false,'contextual','Virtual Employee concept reference.'),
    ('foundry','Foundry','(^|[^[:alnum:]_])Foundry([^[:alnum:]_]|$)',false,'high','Foundry token. High ambiguity means CoMind-specific interpretation requires context.'),
    ('runbook','RunBook','(^|[^[:alnum:]_])RunBook([^[:alnum:]_]|$)',false,'contextual','RunBook concept reference.'),
    ('sovereign_data_node','Sovereign Data Node','(^|[^[:alnum:]_])Sovereign[[:space:]]+Data[[:space:]]+Node([^[:alnum:]_]|$)',false,'low','Named Sovereign Data Node concept reference.'),
    ('conversation_history','Conversation History','(^|[^[:alnum:]_])Conversation[[:space:]]+History([^[:alnum:]_]|$)',false,'contextual','Conversation History concept reference.'),
    ('governance','Governance','(^|[^[:alnum:]_])Governance([^[:alnum:]_]|$)',false,'high','Governance topic reference. Lexical presence alone does not establish a CoMind governance concept.')
), normalized AS (
  SELECT concept_key,'v1'::text AS concept_version,label,'postgres_regex'::text AS matcher_kind,
         match_pattern,case_sensitive,ambiguity_class,definition
  FROM d
)
INSERT INTO comind.cm_archive_concept_definition(
  concept_key,concept_version,label,matcher_kind,match_pattern,case_sensitive,ambiguity_class,definition,definition_sha256
)
SELECT concept_key,concept_version,label,matcher_kind,match_pattern,case_sensitive,ambiguity_class,definition,
       encode(extensions.digest(concat_ws('|',concept_key,concept_version,label,matcher_kind,match_pattern,case_sensitive::text,ambiguity_class,definition),'sha256'),'hex')
FROM normalized
ON CONFLICT (concept_key,concept_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_archive_concept_observation (
  concept_observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL,
  concept_key text NOT NULL,
  concept_version text NOT NULL,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  source_message_id text,
  source_role text,
  branch_state text NOT NULL CHECK (branch_state IN ('active','alternate')),
  observed_at timestamptz,
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence' CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'observed_fact' CHECK (epistemic_class='observed_fact'),
  ambiguity_class text NOT NULL CHECK (ambiguity_class IN ('low','contextual','high')),
  observation_sha256 char(64) NOT NULL CHECK (observation_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id,concept_key,concept_version,source_conversation_id,source_node_id),
  UNIQUE (analysis_run_id,observation_sha256),
  CONSTRAINT cm_archive_concept_observation_definition_fk
    FOREIGN KEY (concept_key,concept_version)
    REFERENCES comind.cm_archive_concept_definition(concept_key,concept_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_concept_observation_membership_fk
    FOREIGN KEY (analysis_run_id,source_conversation_id,source_node_id)
    REFERENCES comind.cm_archive_branch_membership(analysis_run_id,source_conversation_id,source_node_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_concept_summary (
  concept_summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL,
  concept_key text NOT NULL,
  concept_version text NOT NULL,
  message_hit_count bigint NOT NULL CHECK (message_hit_count >= 0),
  conversation_count bigint NOT NULL CHECK (conversation_count >= 0),
  user_message_hit_count bigint NOT NULL CHECK (user_message_hit_count >= 0),
  assistant_message_hit_count bigint NOT NULL CHECK (assistant_message_hit_count >= 0),
  active_message_hit_count bigint NOT NULL CHECK (active_message_hit_count >= 0),
  alternate_message_hit_count bigint NOT NULL CHECK (alternate_message_hit_count >= 0),
  first_message_at timestamptz,
  last_message_at timestamptz,
  first_user_message_at timestamptz,
  first_assistant_message_at timestamptz,
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence' CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'observed_fact' CHECK (epistemic_class='observed_fact'),
  summary_sha256 char(64) NOT NULL CHECK (summary_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id,concept_key,concept_version),
  UNIQUE (analysis_run_id,summary_sha256),
  CONSTRAINT cm_archive_concept_summary_definition_fk
    FOREIGN KEY (concept_key,concept_version)
    REFERENCES comind.cm_archive_concept_definition(concept_key,concept_version)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_concept_bridge (
  concept_bridge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_run_id uuid NOT NULL REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL,
  concept_key_a text NOT NULL,
  concept_version_a text NOT NULL,
  concept_key_b text NOT NULL,
  concept_version_b text NOT NULL,
  cooccurrence_scope text NOT NULL DEFAULT 'conversation' CHECK (cooccurrence_scope='conversation'),
  conversation_count bigint NOT NULL CHECK (conversation_count >= 0),
  first_shared_conversation_at timestamptz,
  last_shared_conversation_at timestamptz,
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence' CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'statistical_association' CHECK (epistemic_class='statistical_association'),
  bridge_sha256 char(64) NOT NULL CHECK (bridge_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_run_id,concept_key_a,concept_version_a,concept_key_b,concept_version_b,cooccurrence_scope),
  UNIQUE (analysis_run_id,bridge_sha256),
  CHECK (concept_key_a < concept_key_b),
  CONSTRAINT cm_archive_concept_bridge_a_fk
    FOREIGN KEY (concept_key_a,concept_version_a)
    REFERENCES comind.cm_archive_concept_definition(concept_key,concept_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_concept_bridge_b_fk
    FOREIGN KEY (concept_key_b,concept_version_b)
    REFERENCES comind.cm_archive_concept_definition(concept_key,concept_version)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_analysis_run_import_created
  ON comind.cm_archive_analysis_run(import_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_archive_branch_membership_run_state
  ON comind.cm_archive_branch_membership(analysis_run_id,branch_state,source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_branch_membership_source
  ON comind.cm_archive_branch_membership(import_id,source_conversation_id,source_node_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_concept_observation_run_concept
  ON comind.cm_archive_concept_observation(analysis_run_id,concept_key,concept_version,observed_at);
CREATE INDEX IF NOT EXISTS idx_cm_archive_concept_observation_source
  ON comind.cm_archive_concept_observation(import_id,source_conversation_id,source_node_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_concept_summary_run_count
  ON comind.cm_archive_concept_summary(analysis_run_id,conversation_count DESC,message_hit_count DESC);
CREATE INDEX IF NOT EXISTS idx_cm_archive_concept_bridge_run_count
  ON comind.cm_archive_concept_bridge(analysis_run_id,conversation_count DESC);

CREATE OR REPLACE FUNCTION comind.cm_reject_archive_analysis_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable CHIST-A03 derived evidence; create a new analysis version instead',TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_analysis_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'cm_archive_analysis_run is durable analytical evidence and cannot be deleted';
  END IF;
  IF OLD.result_state <> 'building' THEN
    RAISE EXCEPTION 'terminal analysis runs are immutable';
  END IF;
  IF NEW.result_state NOT IN ('completed','partial','failed') OR NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'analysis run may only transition once from building to a terminal state';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['result_state','result_counts','completed_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['result_state','result_counts','completed_at']) THEN
    RAISE EXCEPTION 'analysis run finalization may only change result_state, result_counts, and completed_at';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_analysis_policy_immutable ON comind.cm_archive_analysis_policy;
CREATE TRIGGER trg_cm_archive_analysis_policy_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_analysis_policy
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_analysis_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_analysis_run_guard ON comind.cm_archive_analysis_run;
CREATE TRIGGER trg_cm_archive_analysis_run_guard
BEFORE UPDATE OR DELETE ON comind.cm_archive_analysis_run
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_analysis_run_mutation();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_branch_membership','cm_archive_concept_definition',
    'cm_archive_concept_observation','cm_archive_concept_summary','cm_archive_concept_bridge'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON comind.%I',v_table,v_table);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON comind.%I FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_analysis_evidence_mutation()',v_table,v_table);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION comind.cm_begin_archive_analysis_run(
  p_import_id uuid,
  p_policy_key text DEFAULT 'corpus_analytical_baseline',
  p_policy_version text DEFAULT 'a03-v1',
  p_sessionization_run_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_baseline comind.cm_conversation_history_baseline%ROWTYPE;
  v_import comind.cm_archive_import%ROWTYPE;
  v_session_import uuid;
  v_attachment_refs bigint;
  v_identity char(64);
  v_existing uuid;
  v_run_id uuid;
BEGIN
  SELECT * INTO v_baseline FROM comind.cm_conversation_history_baseline WHERE import_id=p_import_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHIST-A03 requires a certified Conversation History baseline'; END IF;

  SELECT * INTO v_import FROM comind.cm_archive_import WHERE import_id=p_import_id;
  IF NOT FOUND OR v_import.status <> 'PASS' THEN RAISE EXCEPTION 'CHIST-A03 requires a PASS archive import'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_archive_analysis_policy
    WHERE policy_key=p_policy_key AND policy_version=p_policy_version
  ) THEN RAISE EXCEPTION 'unknown CHIST-A03 analysis policy %.%',p_policy_key,p_policy_version; END IF;

  IF p_sessionization_run_id IS NOT NULL THEN
    SELECT import_id INTO v_session_import FROM comind.cm_archive_sessionization_run
    WHERE sessionization_run_id=p_sessionization_run_id AND result_state='completed';
    IF NOT FOUND OR v_session_import <> p_import_id THEN
      RAISE EXCEPTION 'sessionization run must be completed and belong to the same archive import';
    END IF;
  END IF;

  SELECT count(*) INTO v_attachment_refs
  FROM comind.cm_archive_attachment_reference WHERE import_id=p_import_id;

  v_identity := encode(extensions.digest(concat_ws('|',
    p_import_id::text,v_baseline.baseline_id::text,v_baseline.source_archive_sha256::text,
    v_baseline.certification_sha256::text,p_policy_key,p_policy_version,
    coalesce(p_sessionization_run_id::text,'none')),'sha256'),'hex');

  SELECT analysis_run_id INTO v_existing
  FROM comind.cm_archive_analysis_run WHERE analysis_identity_sha256=v_identity;
  IF FOUND THEN RETURN v_existing; END IF;

  INSERT INTO comind.cm_archive_analysis_run(
    import_id,baseline_id,sessionization_run_id,policy_key,policy_version,
    source_archive_sha256,certification_sha256,source_conversation_count,source_node_count,
    source_message_count,source_attachment_reference_count,source_stats,engine_metadata,analysis_identity_sha256
  ) VALUES (
    p_import_id,v_baseline.baseline_id,p_sessionization_run_id,p_policy_key,p_policy_version,
    v_baseline.source_archive_sha256,v_baseline.certification_sha256,
    v_import.source_conversation_count,v_import.source_node_count,v_import.source_message_count,v_attachment_refs,
    jsonb_build_object(
      'parser_version',v_import.parser_version,
      'schema_version',v_import.schema_version,
      'parser_error_count',v_import.parser_error_count,
      'parser_warning_count',v_import.parser_warning_count,
      'attachment_reference_count',v_attachment_refs
    ),
    jsonb_build_object('engine_kind','deterministic','paid_provider_call',false,'promotion_performed',false),
    v_identity
  ) RETURNING analysis_run_id INTO v_run_id;
  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_branch_membership(p_analysis_run_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_import_id uuid;
  v_state text;
  v_conversations bigint;
  v_resolved bigint;
  v_inserted bigint;
BEGIN
  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN RAISE EXCEPTION 'analysis run must exist in building state'; END IF;
  IF EXISTS (SELECT 1 FROM comind.cm_archive_branch_membership WHERE analysis_run_id=p_analysis_run_id) THEN
    SELECT count(*) INTO v_inserted FROM comind.cm_archive_branch_membership WHERE analysis_run_id=p_analysis_run_id;
    RETURN v_inserted;
  END IF;

  SELECT count(*) INTO v_conversations FROM comind.cm_archive_conversation_observation WHERE import_id=v_import_id;
  SELECT count(*) INTO v_resolved
  FROM comind.cm_archive_conversation_observation c
  JOIN comind.cm_archive_node_observation n
    ON n.import_id=c.import_id AND n.source_conversation_id=c.source_conversation_id
   AND n.source_node_id=c.raw_conversation->>'current_node'
  WHERE c.import_id=v_import_id;
  IF v_resolved <> v_conversations THEN
    RAISE EXCEPTION 'cannot classify branches: resolved current_node % of % conversations',v_resolved,v_conversations;
  END IF;

  WITH RECURSIVE roots AS MATERIALIZED (
    SELECT c.import_id,c.source_conversation_id,c.raw_conversation->>'current_node' AS current_node
    FROM comind.cm_archive_conversation_observation c WHERE c.import_id=v_import_id
  ), resolved AS MATERIALIZED (
    SELECT r.import_id,r.source_conversation_id,n.source_node_id,n.parent_source_node_id
    FROM roots r
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=r.import_id AND n.source_conversation_id=r.source_conversation_id AND n.source_node_id=r.current_node
  ), active(import_id,source_conversation_id,source_node_id,parent_source_node_id,depth) AS (
    SELECT import_id,source_conversation_id,source_node_id,parent_source_node_id,0 FROM resolved
    UNION ALL
    SELECT a.import_id,a.source_conversation_id,p.source_node_id,p.parent_source_node_id,a.depth+1
    FROM active a
    JOIN comind.cm_archive_node_observation p
      ON p.import_id=a.import_id AND p.source_conversation_id=a.source_conversation_id AND p.source_node_id=a.parent_source_node_id
    WHERE a.depth < 10000
  ), active_distinct AS MATERIALIZED (
    SELECT DISTINCT import_id,source_conversation_id,source_node_id FROM active
  )
  INSERT INTO comind.cm_archive_branch_membership(
    analysis_run_id,import_id,source_conversation_id,source_node_id,source_message_id,source_role,
    source_created_at,branch_state,membership_sha256
  )
  SELECT p_analysis_run_id,n.import_id,n.source_conversation_id,n.source_node_id,n.source_message_id,n.role,n.created_at,
         CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END,
         encode(extensions.digest(concat_ws('|',p_analysis_run_id::text,n.import_id::text,n.source_conversation_id,n.source_node_id,
           CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END),'sha256'),'hex')
  FROM comind.cm_archive_node_observation n
  LEFT JOIN active_distinct a
    ON a.import_id=n.import_id AND a.source_conversation_id=n.source_conversation_id AND a.source_node_id=n.source_node_id
  WHERE n.import_id=v_import_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_concept_observations(p_analysis_run_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_import_id uuid;
  v_state text;
  v_node_count bigint;
  v_membership_count bigint;
  v_inserted bigint;
BEGIN
  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN RAISE EXCEPTION 'analysis run must exist in building state'; END IF;
  IF EXISTS (SELECT 1 FROM comind.cm_archive_concept_observation WHERE analysis_run_id=p_analysis_run_id) THEN
    SELECT count(*) INTO v_inserted FROM comind.cm_archive_concept_observation WHERE analysis_run_id=p_analysis_run_id;
    RETURN v_inserted;
  END IF;

  SELECT count(*) INTO v_node_count FROM comind.cm_archive_node_observation WHERE import_id=v_import_id;
  SELECT count(*) INTO v_membership_count FROM comind.cm_archive_branch_membership WHERE analysis_run_id=p_analysis_run_id;
  IF v_membership_count <> v_node_count THEN
    RAISE EXCEPTION 'branch membership must cover every source node before concept analysis: % of %',v_membership_count,v_node_count;
  END IF;

  WITH base AS MATERIALIZED (
    SELECT m.analysis_run_id,m.import_id,m.source_conversation_id,m.source_node_id,m.source_message_id,
           m.source_role,m.source_created_at,m.branch_state,n.raw_node,n.raw_node #> '{message,content}' AS content
    FROM comind.cm_archive_branch_membership m
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=m.import_id AND n.source_conversation_id=m.source_conversation_id AND n.source_node_id=m.source_node_id
    WHERE m.analysis_run_id=p_analysis_run_id AND m.source_message_id IS NOT NULL
  ), extracted AS MATERIALIZED (
    SELECT b.*,
      CASE
        WHEN jsonb_typeof(b.content)='string' THEN b.content #>> '{}'
        WHEN jsonb_typeof(b.content)='object' THEN coalesce(
          (SELECT string_agg(piece,E'\n' ORDER BY ord) FROM (
             SELECT ord,CASE
               WHEN jsonb_typeof(part)='string' THEN part #>> '{}'
               WHEN jsonb_typeof(part)='object' AND jsonb_typeof(part->'text')='string' THEN part->>'text'
               ELSE NULL END AS piece
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.content->'parts')='array' THEN b.content->'parts' ELSE '[]'::jsonb END)
             WITH ORDINALITY x(part,ord)
          ) p WHERE piece IS NOT NULL),
          CASE WHEN jsonb_typeof(b.content->'text')='string' THEN b.content->>'text' END,
          CASE WHEN jsonb_typeof(b.raw_node #> '{message,text}')='string' THEN b.raw_node #>> '{message,text}' END,
          '')
        ELSE coalesce(CASE WHEN jsonb_typeof(b.raw_node #> '{message,text}')='string' THEN b.raw_node #>> '{message,text}' END,'')
      END AS message_text
    FROM base b
  )
  INSERT INTO comind.cm_archive_concept_observation(
    analysis_run_id,import_id,concept_key,concept_version,source_conversation_id,source_node_id,
    source_message_id,source_role,branch_state,observed_at,ambiguity_class,observation_sha256
  )
  SELECT p_analysis_run_id,e.import_id,d.concept_key,d.concept_version,e.source_conversation_id,e.source_node_id,
         e.source_message_id,e.source_role,e.branch_state,e.source_created_at,d.ambiguity_class,
         encode(extensions.digest(concat_ws('|',p_analysis_run_id::text,d.concept_key,d.concept_version,
           e.source_conversation_id,e.source_node_id),'sha256'),'hex')
  FROM extracted e
  CROSS JOIN comind.cm_archive_concept_definition d
  WHERE d.concept_version='v1'
    AND CASE WHEN d.case_sensitive THEN e.message_text ~ d.match_pattern ELSE e.message_text ~* d.match_pattern END;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_finalize_archive_analysis_run(p_analysis_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_run comind.cm_archive_analysis_run%ROWTYPE;
  v_membership_count bigint;
  v_source_node_count bigint;
  v_observation_count bigint;
  v_summary_count bigint;
  v_bridge_count bigint;
  v_active_message_count bigint;
  v_alternate_message_count bigint;
  v_counts jsonb;
BEGIN
  SELECT * INTO v_run FROM comind.cm_archive_analysis_run WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis run does not exist'; END IF;
  IF v_run.result_state <> 'building' THEN RETURN v_run.result_counts; END IF;

  SELECT count(*) INTO v_membership_count FROM comind.cm_archive_branch_membership WHERE analysis_run_id=p_analysis_run_id;
  v_source_node_count := v_run.source_node_count;
  IF v_membership_count <> v_source_node_count THEN
    RAISE EXCEPTION 'cannot finalize: branch membership % does not match source node count %',v_membership_count,v_source_node_count;
  END IF;

  INSERT INTO comind.cm_archive_concept_summary(
    analysis_run_id,import_id,concept_key,concept_version,message_hit_count,conversation_count,
    user_message_hit_count,assistant_message_hit_count,active_message_hit_count,alternate_message_hit_count,
    first_message_at,last_message_at,first_user_message_at,first_assistant_message_at,summary_sha256
  )
  SELECT p_analysis_run_id,v_run.import_id,o.concept_key,o.concept_version,count(*),count(DISTINCT o.source_conversation_id),
         count(*) FILTER (WHERE o.source_role='user'),count(*) FILTER (WHERE o.source_role='assistant'),
         count(*) FILTER (WHERE o.branch_state='active'),count(*) FILTER (WHERE o.branch_state='alternate'),
         min(o.observed_at),max(o.observed_at),min(o.observed_at) FILTER (WHERE o.source_role='user'),
         min(o.observed_at) FILTER (WHERE o.source_role='assistant'),
         encode(extensions.digest(concat_ws('|',p_analysis_run_id::text,o.concept_key,o.concept_version,
           count(*)::text,count(DISTINCT o.source_conversation_id)::text,
           coalesce(min(o.observed_at)::text,'none'),coalesce(max(o.observed_at)::text,'none')),'sha256'),'hex')
  FROM comind.cm_archive_concept_observation o
  WHERE o.analysis_run_id=p_analysis_run_id
  GROUP BY o.concept_key,o.concept_version
  ON CONFLICT (analysis_run_id,concept_key,concept_version) DO NOTHING;

  WITH concept_conv AS MATERIALIZED (
    SELECT concept_key,concept_version,source_conversation_id,min(observed_at) AS first_at,max(observed_at) AS last_at
    FROM comind.cm_archive_concept_observation
    WHERE analysis_run_id=p_analysis_run_id
    GROUP BY concept_key,concept_version,source_conversation_id
  ), pairs AS (
    SELECT a.concept_key AS key_a,a.concept_version AS version_a,b.concept_key AS key_b,b.concept_version AS version_b,
           a.source_conversation_id,
           least(a.first_at,b.first_at) AS conversation_first_at,
           greatest(a.last_at,b.last_at) AS conversation_last_at
    FROM concept_conv a
    JOIN concept_conv b ON b.source_conversation_id=a.source_conversation_id AND a.concept_key < b.concept_key
  )
  INSERT INTO comind.cm_archive_concept_bridge(
    analysis_run_id,import_id,concept_key_a,concept_version_a,concept_key_b,concept_version_b,
    conversation_count,first_shared_conversation_at,last_shared_conversation_at,bridge_sha256
  )
  SELECT p_analysis_run_id,v_run.import_id,key_a,version_a,key_b,version_b,count(*),min(conversation_first_at),max(conversation_last_at),
         encode(extensions.digest(concat_ws('|',p_analysis_run_id::text,key_a,version_a,key_b,version_b,
           count(*)::text,coalesce(min(conversation_first_at)::text,'none'),coalesce(max(conversation_last_at)::text,'none')),'sha256'),'hex')
  FROM pairs GROUP BY key_a,version_a,key_b,version_b
  ON CONFLICT (analysis_run_id,concept_key_a,concept_version_a,concept_key_b,concept_version_b,cooccurrence_scope) DO NOTHING;

  SELECT count(*) INTO v_observation_count FROM comind.cm_archive_concept_observation WHERE analysis_run_id=p_analysis_run_id;
  SELECT count(*) INTO v_summary_count FROM comind.cm_archive_concept_summary WHERE analysis_run_id=p_analysis_run_id;
  SELECT count(*) INTO v_bridge_count FROM comind.cm_archive_concept_bridge WHERE analysis_run_id=p_analysis_run_id;
  SELECT count(*) FILTER (WHERE source_message_id IS NOT NULL AND branch_state='active'),
         count(*) FILTER (WHERE source_message_id IS NOT NULL AND branch_state='alternate')
    INTO v_active_message_count,v_alternate_message_count
  FROM comind.cm_archive_branch_membership WHERE analysis_run_id=p_analysis_run_id;

  v_counts := jsonb_build_object(
    'branch_membership_count',v_membership_count,
    'active_message_node_count',v_active_message_count,
    'alternate_message_node_count',v_alternate_message_count,
    'concept_observation_count',v_observation_count,
    'concept_summary_count',v_summary_count,
    'concept_bridge_count',v_bridge_count
  );

  UPDATE comind.cm_archive_analysis_run
  SET result_state='completed',result_counts=v_counts,completed_at=now()
  WHERE analysis_run_id=p_analysis_run_id;
  RETURN v_counts;
END;
$$;

CREATE OR REPLACE VIEW comind.v_archive_analysis_run_summary AS
SELECT r.analysis_run_id,r.import_id,r.baseline_id,r.sessionization_run_id,r.policy_key,r.policy_version,
       r.source_archive_sha256,r.certification_sha256,r.source_conversation_count,r.source_node_count,
       r.source_message_count,r.source_attachment_reference_count,r.result_state,r.source_stats,r.result_counts,
       r.engine_metadata,r.analysis_identity_sha256,r.created_at,r.completed_at
FROM comind.cm_archive_analysis_run r;

ALTER TABLE comind.cm_archive_analysis_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_analysis_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_analysis_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_analysis_run FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_branch_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_branch_membership FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_definition FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_observation FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_summary FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_bridge ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_bridge FORCE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_analysis_policy','cm_archive_analysis_run','cm_archive_branch_membership',
    'cm_archive_concept_definition','cm_archive_concept_observation','cm_archive_concept_summary','cm_archive_concept_bridge'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS chist_a03_reader_select ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY chist_a03_reader_select ON comind.%I FOR SELECT TO comind_conversation_history_reader USING (true)',v_table);
    EXECUTE format('DROP POLICY IF EXISTS chist_a03_deriver_select ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY chist_a03_deriver_select ON comind.%I FOR SELECT TO comind_conversation_history_deriver USING (true)',v_table);
  END LOOP;
END
$$;

CREATE POLICY chist_a03_deriver_insert_run ON comind.cm_archive_analysis_run
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
CREATE POLICY chist_a03_deriver_update_run ON comind.cm_archive_analysis_run
FOR UPDATE TO comind_conversation_history_deriver USING (result_state='building') WITH CHECK (result_state IN ('completed','partial','failed'));
CREATE POLICY chist_a03_deriver_insert_membership ON comind.cm_archive_branch_membership
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
CREATE POLICY chist_a03_deriver_insert_observation ON comind.cm_archive_concept_observation
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
CREATE POLICY chist_a03_deriver_insert_summary ON comind.cm_archive_concept_summary
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
CREATE POLICY chist_a03_deriver_insert_bridge ON comind.cm_archive_concept_bridge
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);

REVOKE ALL ON comind.cm_archive_analysis_policy,comind.cm_archive_analysis_run,
  comind.cm_archive_branch_membership,comind.cm_archive_concept_definition,
  comind.cm_archive_concept_observation,comind.cm_archive_concept_summary,
  comind.cm_archive_concept_bridge FROM PUBLIC;
REVOKE ALL ON comind.v_archive_analysis_run_summary FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_reject_archive_analysis_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_analysis_run_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_begin_archive_analysis_run(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_branch_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_concept_observations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_finalize_archive_analysis_run(uuid) FROM PUBLIC;

DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON comind.cm_archive_analysis_policy FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_analysis_run FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_branch_membership FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_concept_definition FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_concept_observation FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_concept_summary FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.cm_archive_concept_bridge FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON comind.v_archive_analysis_run_summary FROM %I',role_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION comind.cm_begin_archive_analysis_run(uuid,text,text,uuid) FROM %I',role_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION comind.cm_populate_archive_branch_membership(uuid) FROM %I',role_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION comind.cm_populate_archive_concept_observations(uuid) FROM %I',role_name);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION comind.cm_finalize_archive_analysis_run(uuid) FROM %I',role_name);
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA comind TO comind_conversation_history_reader,comind_conversation_history_deriver;
GRANT SELECT ON comind.cm_archive_analysis_policy,comind.cm_archive_analysis_run,
  comind.cm_archive_branch_membership,comind.cm_archive_concept_definition,
  comind.cm_archive_concept_observation,comind.cm_archive_concept_summary,
  comind.cm_archive_concept_bridge,comind.v_archive_analysis_run_summary
TO comind_conversation_history_reader;
GRANT SELECT ON comind.cm_archive_analysis_policy,comind.cm_archive_analysis_run,
  comind.cm_archive_branch_membership,comind.cm_archive_concept_definition,
  comind.cm_archive_concept_observation,comind.cm_archive_concept_summary,
  comind.cm_archive_concept_bridge,comind.v_archive_analysis_run_summary
TO comind_conversation_history_deriver;
GRANT INSERT ON comind.cm_archive_analysis_run,comind.cm_archive_branch_membership,
  comind.cm_archive_concept_observation,comind.cm_archive_concept_summary,comind.cm_archive_concept_bridge
TO comind_conversation_history_deriver;
GRANT UPDATE (result_state,result_counts,completed_at) ON comind.cm_archive_analysis_run TO comind_conversation_history_deriver;
GRANT EXECUTE ON FUNCTION comind.cm_begin_archive_analysis_run(uuid,text,text,uuid),
  comind.cm_populate_archive_branch_membership(uuid),
  comind.cm_populate_archive_concept_observations(uuid),
  comind.cm_finalize_archive_analysis_run(uuid)
TO comind_conversation_history_deriver;

COMMENT ON TABLE comind.cm_archive_analysis_run IS 'CHIST-A03 immutable-after-finalization corpus analysis run over one certified archive baseline.';
COMMENT ON TABLE comind.cm_archive_branch_membership IS 'CHIST-A03 deterministic source graph membership relative to each conversation current_node. Alternate branches remain evidence.';
COMMENT ON TABLE comind.cm_archive_concept_observation IS 'CHIST-A03 deterministic lexical message-level concept presence with actor and branch provenance. Presence does not establish concept meaning or user belief.';
COMMENT ON TABLE comind.cm_archive_concept_summary IS 'CHIST-A03 aggregate lexical concept evidence with actor attribution and temporal bounds.';
COMMENT ON TABLE comind.cm_archive_concept_bridge IS 'CHIST-A03 conversation-level concept co-occurrence. It is a statistical association and never a causal claim.';

COMMIT;
