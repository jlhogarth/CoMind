BEGIN;

SET search_path TO comind, public;

-- RLIB-003 clean-bootstrap contract:
-- seed only governed metadata and verified fingerprints for the five accepted
-- RLIB-001 corpus records. Google Drive remains the document store. No PDF
-- bytes, VE authority, provider authority, or Production activation live here.
INSERT INTO comind.cm_research_refs(
  title,
  url,
  notes,
  tags,
  publisher,
  document_identifier,
  source_kind,
  authority_level,
  lifecycle_status,
  version_label,
  published_on,
  drive_file_id,
  drive_url,
  drive_folder_id,
  mime_type,
  byte_size,
  content_sha256,
  fingerprint_algorithm,
  freshness_due_at,
  related_capabilities,
  metadata
)
SELECT *
FROM (
  VALUES
  (
    'Artificial Intelligence Risk Management Framework (AI RMF 1.0)'::text,
    'https://doi.org/10.6028/NIST.AI.100-1'::text,
    'Canonical RLIB-001 metadata seed for NIST AI RMF 1.0. NIST reported a revision in progress when RLIB-001 accepted this source.'::text,
    ARRAY['nist','ai-rmf','governance','risk-management']::text[],
    'National Institute of Standards and Technology'::text,
    'NIST AI 100-1'::text,
    'framework'::text,
    'primary_authoritative'::text,
    'current'::text,
    '1.0'::text,
    NULL::date,
    '1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx'::text,
    'https://drive.google.com/file/d/1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx/view'::text,
    '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'::text,
    'application/pdf'::text,
    1946127::bigint,
    '7576edb531d9848825814ee88e28b1795d3a84b435b4b797d3670eafdc4a89f1'::char(64),
    'sha256:raw-bytes'::text,
    TIMESTAMPTZ '2026-11-30 00:00:00+00',
    ARRAY['VE governance','AI risk management','AIMS','human authority']::text[],
    jsonb_build_object(
      'bootstrap_provenance','RLIB-001 accepted corpus',
      'raw_sha256_status','verified',
      'doi','10.6028/NIST.AI.100-1',
      'revision_state','revision_in_progress_2026',
      'production_activation',false
    )
  ),
  (
    'NIST AI RMF Playbook'::text,
    'https://airc.nist.gov/airmf-resources/playbook/'::text,
    'Canonical RLIB-001 metadata seed for the NIST AI RMF Playbook. Treat as voluntary implementation guidance aligned to Govern, Map, Measure, and Manage.'::text,
    ARRAY['nist','ai-rmf','playbook','governance']::text[],
    'National Institute of Standards and Technology'::text,
    'NIST AI RMF Playbook'::text,
    'playbook'::text,
    'primary_authoritative'::text,
    'current'::text,
    NULL::text,
    NULL::date,
    '1fZ4349LhmIovoxoz20tpAbgjlXmX479T'::text,
    'https://drive.google.com/file/d/1fZ4349LhmIovoxoz20tpAbgjlXmX479T/view'::text,
    '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'::text,
    'application/pdf'::text,
    2882270::bigint,
    '65d6101d806502875aadb0fd19a75c3a9cc9a5e9461129e9398a39192d8202d2'::char(64),
    'sha256:raw-bytes'::text,
    TIMESTAMPTZ '2026-11-30 00:00:00+00',
    ARRAY['VE governance','AIMS','monitoring','documentation','human oversight']::text[],
    jsonb_build_object(
      'bootstrap_provenance','RLIB-001 accepted corpus',
      'raw_sha256_status','verified',
      'revision_state','update_expected_after_ai_rmf_revision',
      'production_activation',false
    )
  ),
  (
    'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile'::text,
    'https://doi.org/10.6028/NIST.AI.600-1'::text,
    'Final NIST Generative AI profile and canonical replacement for the withdrawn Initial Public Draft.'::text,
    ARRAY['nist','ai-rmf','generative-ai','governance']::text[],
    'National Institute of Standards and Technology'::text,
    'NIST AI 600-1'::text,
    'profile'::text,
    'primary_authoritative'::text,
    'current'::text,
    'Final'::text,
    DATE '2024-07-26',
    '1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6'::text,
    'https://drive.google.com/file/d/1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6/view'::text,
    '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'::text,
    'application/pdf'::text,
    1174643::bigint,
    '6e73620ab6b64e90ef2c04bf0e0d6246185a2f4b1b13cab0df494496cff89b6a'::char(64),
    'sha256:raw-bytes'::text,
    TIMESTAMPTZ '2027-01-30 00:00:00+00',
    ARRAY['VE governance','generative AI risk management','AIMS','evidence and testing']::text[],
    jsonb_build_object(
      'bootstrap_provenance','RLIB-001 accepted corpus',
      'raw_sha256_status','verified',
      'publication_status','final',
      'doi','10.6028/NIST.AI.600-1',
      'production_activation',false
    )
  ),
  (
    'ISO 42001 Implementation Checklist: A Practical Guide for Responsible AI Governance'::text,
    'https://drive.google.com/file/d/1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx/view'::text,
    'GSDC secondary implementation guidance about ISO/IEC 42001. This record is explicitly non-normative and must never be represented as the ISO/IEC 42001 standard.'::text,
    ARRAY['iso-42001','aims','secondary-guidance','governance']::text[],
    'Global Skill Development Council'::text,
    'GSDC ISO 42001 Implementation Checklist'::text,
    'guidance'::text,
    'secondary_guidance'::text,
    'candidate'::text,
    NULL::text,
    NULL::date,
    '1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx'::text,
    'https://drive.google.com/file/d/1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx/view'::text,
    '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'::text,
    'application/pdf'::text,
    738620::bigint,
    'b9d6a9b777409415316bc6006a5bec112891844b2b57dc1eb425024ea0acbd66'::char(64),
    'sha256:raw-bytes'::text,
    TIMESTAMPTZ '2027-01-30 00:00:00+00',
    ARRAY['AIMS education','VE governance education']::text[],
    jsonb_build_object(
      'bootstrap_provenance','RLIB-001 accepted corpus',
      'raw_sha256_status','verified',
      'authority_note','secondary guidance, not ISO normative text',
      'official_standard_catalog','https://www.iso.org/standard/42001',
      'production_activation',false
    )
  ),
  (
    'NIST AI 600-1 Initial Public Draft'::text,
    'https://drive.google.com/file/d/19Cksd5HogXnQepDZCayPNURCmspGSBfO/view'::text,
    'Withdrawn Initial Public Draft retained only for governed historical and supersession literacy.'::text,
    ARRAY['nist','ai-rmf','generative-ai','historical']::text[],
    'National Institute of Standards and Technology'::text,
    'NIST AI 600-1 IPD'::text,
    'draft'::text,
    'primary_authoritative'::text,
    'withdrawn'::text,
    'Initial Public Draft'::text,
    DATE '2024-04-29',
    '19Cksd5HogXnQepDZCayPNURCmspGSBfO'::text,
    'https://drive.google.com/file/d/19Cksd5HogXnQepDZCayPNURCmspGSBfO/view'::text,
    '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'::text,
    'application/pdf'::text,
    1192324::bigint,
    'ddb7a400c1c03fe4430e34e5a827d0c3699ebea5cb39d6664df9ff83fd6726ee'::char(64),
    'sha256:raw-bytes'::text,
    NULL::timestamptz,
    ARRAY['VE governance history','generative AI risk management history']::text[],
    jsonb_build_object(
      'bootstrap_provenance','RLIB-001 accepted corpus',
      'raw_sha256_status','verified',
      'withdrawal_date','2024-07-26',
      'supersession_evidence','embedded NIST withdrawal notice',
      'production_activation',false
    )
  )
) AS seed(
  title,url,notes,tags,publisher,document_identifier,source_kind,authority_level,
  lifecycle_status,version_label,published_on,drive_file_id,drive_url,drive_folder_id,
  mime_type,byte_size,content_sha256,fingerprint_algorithm,freshness_due_at,
  related_capabilities,metadata
)
ON CONFLICT (drive_file_id) WHERE drive_file_id IS NOT NULL DO UPDATE SET
  notes = COALESCE(comind.cm_research_refs.notes, EXCLUDED.notes),
  publisher = COALESCE(comind.cm_research_refs.publisher, EXCLUDED.publisher),
  document_identifier = COALESCE(comind.cm_research_refs.document_identifier, EXCLUDED.document_identifier),
  source_kind = CASE
    WHEN comind.cm_research_refs.source_kind='web_reference' THEN EXCLUDED.source_kind
    ELSE comind.cm_research_refs.source_kind
  END,
  authority_level = CASE
    WHEN comind.cm_research_refs.authority_level='unverified' THEN EXCLUDED.authority_level
    ELSE comind.cm_research_refs.authority_level
  END,
  version_label = COALESCE(comind.cm_research_refs.version_label, EXCLUDED.version_label),
  published_on = COALESCE(comind.cm_research_refs.published_on, EXCLUDED.published_on),
  drive_url = COALESCE(comind.cm_research_refs.drive_url, EXCLUDED.drive_url),
  drive_folder_id = COALESCE(comind.cm_research_refs.drive_folder_id, EXCLUDED.drive_folder_id),
  mime_type = COALESCE(comind.cm_research_refs.mime_type, EXCLUDED.mime_type),
  byte_size = COALESCE(comind.cm_research_refs.byte_size, EXCLUDED.byte_size),
  content_sha256 = COALESCE(comind.cm_research_refs.content_sha256, EXCLUDED.content_sha256),
  fingerprint_algorithm = COALESCE(comind.cm_research_refs.fingerprint_algorithm, EXCLUDED.fingerprint_algorithm),
  freshness_due_at = COALESCE(comind.cm_research_refs.freshness_due_at, EXCLUDED.freshness_due_at),
  related_capabilities = CASE
    WHEN cardinality(comind.cm_research_refs.related_capabilities)=0 THEN EXCLUDED.related_capabilities
    ELSE comind.cm_research_refs.related_capabilities
  END,
  metadata = COALESCE(comind.cm_research_refs.metadata,'{}'::jsonb) || EXCLUDED.metadata,
  updated_at = now();

-- Fail closed if a Drive identity already exists with bytes that disagree with
-- the accepted RLIB-001 fingerprint. Do not overwrite a conflicting hash.
DO $$
DECLARE
  v_conflicts integer;
BEGIN
  SELECT count(*) INTO v_conflicts
  FROM comind.cm_research_refs
  WHERE (drive_file_id,content_sha256) NOT IN (
    ('1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx','7576edb531d9848825814ee88e28b1795d3a84b435b4b797d3670eafdc4a89f1'::char(64)),
    ('1fZ4349LhmIovoxoz20tpAbgjlXmX479T','65d6101d806502875aadb0fd19a75c3a9cc9a5e9461129e9398a39192d8202d2'::char(64)),
    ('1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6','6e73620ab6b64e90ef2c04bf0e0d6246185a2f4b1b13cab0df494496cff89b6a'::char(64)),
    ('1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx','b9d6a9b777409415316bc6006a5bec112891844b2b57dc1eb425024ea0acbd66'::char(64)),
    ('19Cksd5HogXnQepDZCayPNURCmspGSBfO','ddb7a400c1c03fe4430e34e5a827d0c3699ebea5cb39d6664df9ff83fd6726ee'::char(64))
  )
  AND drive_file_id IN (
    '1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx',
    '1fZ4349LhmIovoxoz20tpAbgjlXmX479T',
    '1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6',
    '1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx',
    '19Cksd5HogXnQepDZCayPNURCmspGSBfO'
  );

  IF v_conflicts <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 detected % canonical Drive identities with fingerprint drift',v_conflicts;
  END IF;
END
$$;

-- Preserve the accepted withdrawn-draft -> final relationship. Never silently
-- replace a different existing supersession target.
DO $$
DECLARE
  v_draft uuid;
  v_final uuid;
  v_existing uuid;
BEGIN
  SELECT ref_id,superseded_by_ref_id INTO STRICT v_draft,v_existing
  FROM comind.cm_research_refs
  WHERE drive_file_id='19Cksd5HogXnQepDZCayPNURCmspGSBfO';

  SELECT ref_id INTO STRICT v_final
  FROM comind.cm_research_refs
  WHERE drive_file_id='1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6';

  IF v_existing IS NOT NULL AND v_existing <> v_final THEN
    RAISE EXCEPTION 'RLIB-003 refuses to overwrite conflicting NIST AI 600-1 supersession target';
  END IF;

  UPDATE comind.cm_research_refs
  SET superseded_by_ref_id=v_final,
      updated_at=now()
  WHERE ref_id=v_draft
    AND superseded_by_ref_id IS NULL;
END
$$;

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
    'curriculum_version','0.1',
    'bootstrap_mode','canonical metadata references only; no document bytes'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  objective = EXCLUDED.objective,
  audience = EXCLUDED.audience,
  metadata = comind.cm_learning_path.metadata || EXCLUDED.metadata,
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

  DELETE FROM comind.cm_learning_path_item
  WHERE path_id=v_path_id
    AND ref_id NOT IN (v_ai_rmf,v_playbook,v_gai_final,v_iso_guide,v_gai_draft);

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
