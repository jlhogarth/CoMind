BEGIN;

SET search_path TO comind, public;

INSERT INTO comind.cm_learning_path(
  slug,
  title,
  objective,
  audience,
  status,
  metadata
) VALUES (
  'virtual-employee-standards-v0-1',
  'Virtual Employee Standards Learning Path v0.1',
  'Teach CoMind Virtual Employees and their supervisors the governed identity, authority, risk, evidence, lifecycle, source-authority, and generative-AI controls needed to operate under the CoMind VE model.',
  'CoMind Virtual Employees, VE supervisors, reviewers, and future colony coordinators',
  'draft',
  jsonb_build_object(
    'governing_issue','https://github.com/jlhogarth/CoMind/issues/376',
    'governing_standard_candidate','VE-STD-001',
    'governing_standard_pr','https://github.com/jlhogarth/CoMind/pull/355',
    'governing_standard_state','draft_dependency',
    'activation_rule','Do not activate until the governing VE standard is accepted on main and required Research Library sources pass freshness/currentness checks.',
    'production_activation',false,
    'curriculum_version','0.1'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  objective = EXCLUDED.objective,
  audience = EXCLUDED.audience,
  status = 'draft',
  metadata = EXCLUDED.metadata,
  updated_at = now();

DO $$
DECLARE
  v_path_id uuid;
  v_ai_rmf uuid;
  v_playbook uuid;
  v_gai_final uuid;
  v_iso_guide uuid;
  v_gai_draft uuid;
BEGIN
  SELECT path_id INTO STRICT v_path_id
  FROM comind.cm_learning_path
  WHERE slug='virtual-employee-standards-v0-1';

  SELECT ref_id INTO STRICT v_ai_rmf
  FROM comind.cm_research_refs
  WHERE drive_file_id='1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx';

  SELECT ref_id INTO STRICT v_playbook
  FROM comind.cm_research_refs
  WHERE drive_file_id='1fZ4349LhmIovoxoz20tpAbgjlXmX479T';

  SELECT ref_id INTO STRICT v_gai_final
  FROM comind.cm_research_refs
  WHERE drive_file_id='1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6';

  SELECT ref_id INTO STRICT v_iso_guide
  FROM comind.cm_research_refs
  WHERE drive_file_id='1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx';

  SELECT ref_id INTO STRICT v_gai_draft
  FROM comind.cm_research_refs
  WHERE drive_file_id='19Cksd5HogXnQepDZCayPNURCmspGSBfO';

  INSERT INTO comind.cm_learning_path_item(
    path_id,ref_id,sequence_no,section_title,rationale,required,learning_objectives,metadata
  ) VALUES
  (
    v_path_id,v_ai_rmf,1,'Foundation: AI risk management',
    'Establish the common risk-management vocabulary and the Govern, Map, Measure, and Manage functions that CoMind uses as continuous rather than one-time controls.',
    true,
    ARRAY[
      'Explain the purpose of AI risk management and why AI risk is socio-technical.',
      'Use Govern, Map, Measure, and Manage as continuous risk-management functions.',
      'Recognize that source currency and framework version are governed concerns.'
    ],
    jsonb_build_object('curriculum_role','foundation','source_expectation','current primary authoritative')
  ),
  (
    v_path_id,v_playbook,2,'Practice: operationalizing the AI RMF',
    'Translate the AI RMF functions into practical organizational actions while preserving the Playbook as voluntary guidance rather than a mandatory end-to-end checklist.',
    true,
    ARRAY[
      'Select Playbook actions appropriate to a VE purpose, context, and risk tier.',
      'Connect governance actions to policies, responsibilities, documentation, training, monitoring, and review.',
      'Avoid treating the Playbook as a complete ordered checklist.'
    ],
    jsonb_build_object('curriculum_role','practice','source_expectation','current primary authoritative')
  ),
  (
    v_path_id,v_gai_final,3,'Generative AI: VE-specific risk profile',
    'Apply the final NIST generative-AI profile to VE and agent work, especially governance, provenance, pre-deployment testing, incident disclosure, and risks unique to or exacerbated by generative AI.',
    true,
    ARRAY[
      'Identify generative-AI risks relevant to Virtual Employees and agent colonies.',
      'Relate governance, content provenance, pre-deployment testing, and incident disclosure to VE acceptance and operation.',
      'Select suggested actions that fit the VE context while preserving human authority and evidence.'
    ],
    jsonb_build_object('curriculum_role','generative-ai-profile','source_expectation','current primary authoritative')
  ),
  (
    v_path_id,v_iso_guide,4,'AIMS orientation: implementation guidance',
    'Provide practical AIMS-oriented implementation vocabulary while explicitly teaching that this GSDC document is secondary guidance and is not ISO/IEC 42001 normative text.',
    false,
    ARRAY[
      'Explain the purpose of an Artificial Intelligence Management System at an implementation level.',
      'Connect organizational scope, leadership, risk, data governance, lifecycle controls, monitoring, and continual improvement to CoMind VE governance.',
      'Distinguish secondary implementation guidance from an official standard or normative source.'
    ],
    jsonb_build_object('curriculum_role','secondary-aims-guidance','source_expectation','secondary guidance, non-normative','optional',true)
  ),
  (
    v_path_id,v_gai_draft,5,'Source governance: supersession literacy',
    'Use the withdrawn NIST AI 600-1 Initial Public Draft as a controlled historical example of why a VE must inspect source lifecycle and follow the canonical superseding record.',
    false,
    ARRAY[
      'Recognize withdrawn and superseded source material.',
      'Follow a supersession link to the current canonical source before relying on substantive guidance.',
      'Preserve historical provenance without confusing historical text with current authority.'
    ],
    jsonb_build_object('curriculum_role','source-governance-exercise','source_expectation','withdrawn historical source','optional',true)
  )
  ON CONFLICT (path_id,ref_id) DO UPDATE SET
    sequence_no = EXCLUDED.sequence_no,
    section_title = EXCLUDED.section_title,
    rationale = EXCLUDED.rationale,
    required = EXCLUDED.required,
    learning_objectives = EXCLUDED.learning_objectives,
    metadata = EXCLUDED.metadata;
END
$$;

COMMIT;
