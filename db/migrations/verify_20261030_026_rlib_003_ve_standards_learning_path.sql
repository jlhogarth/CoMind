DO $$
DECLARE
  v_path_id uuid;
  v_status text;
  v_items integer;
  v_required integer;
  v_optional integer;
  v_sequence integer[];
  v_bad_required integer;
  v_bad_guidance integer;
  v_bad_history integer;
  v_bad_fingerprint integer;
  v_seed_count integer;
  v_production text;
  v_dependency_state text;
BEGIN
  SELECT path_id,status,metadata->>'production_activation',metadata->>'governing_standard_state'
    INTO STRICT v_path_id,v_status,v_production,v_dependency_state
  FROM comind.cm_learning_path
  WHERE slug='virtual-employee-standards-v0-1';

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'RLIB-003 learning path must remain draft until separately authorized activation; status=%',v_status;
  END IF;

  IF v_production IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'RLIB-003 Production boundary drifted: production_activation=%',v_production;
  END IF;

  IF v_dependency_state IS DISTINCT FROM 'accepted_main' THEN
    RAISE EXCEPTION 'RLIB-003 governing VE standard dependency is not accepted: %',v_dependency_state;
  END IF;

  IF (SELECT metadata->>'governing_standard_commit' FROM comind.cm_learning_path WHERE path_id=v_path_id)
      IS DISTINCT FROM 'ef1f4ebf6b37addc1ce7c1c1ea06839ba67ecfc8' THEN
    RAISE EXCEPTION 'RLIB-003 governing standard commit is not the accepted VE-STD-001 merge';
  END IF;

  SELECT count(*) INTO v_seed_count
  FROM comind.cm_research_refs
  WHERE drive_file_id IN (
    '1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx',
    '1fZ4349LhmIovoxoz20tpAbgjlXmX479T',
    '1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6',
    '1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx',
    '19Cksd5HogXnQepDZCayPNURCmspGSBfO'
  );

  IF v_seed_count <> 5 THEN
    RAISE EXCEPTION 'RLIB-003 clean bootstrap did not establish all five canonical metadata records: %',v_seed_count;
  END IF;

  SELECT count(*) INTO v_bad_fingerprint
  FROM comind.cm_research_refs
  WHERE (content_sha256 IS NULL OR fingerprint_algorithm IS DISTINCT FROM 'sha256:raw-bytes' OR (drive_file_id,content_sha256) NOT IN (
    ('1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx','7576edb531d9848825814ee88e28b1795d3a84b435b4b797d3670eafdc4a89f1'::char(64)),
    ('1fZ4349LhmIovoxoz20tpAbgjlXmX479T','65d6101d806502875aadb0fd19a75c3a9cc9a5e9461129e9398a39192d8202d2'::char(64)),
    ('1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6','6e73620ab6b64e90ef2c04bf0e0d6246185a2f4b1b13cab0df494496cff89b6a'::char(64)),
    ('1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx','b9d6a9b777409415316bc6006a5bec112891844b2b57dc1eb425024ea0acbd66'::char(64)),
    ('19Cksd5HogXnQepDZCayPNURCmspGSBfO','ddb7a400c1c03fe4430e34e5a827d0c3699ebea5cb39d6664df9ff83fd6726ee'::char(64))
  ))
  AND drive_file_id IN (
    '1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx',
    '1fZ4349LhmIovoxoz20tpAbgjlXmX479T',
    '1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6',
    '1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx',
    '19Cksd5HogXnQepDZCayPNURCmspGSBfO'
  );

  IF v_bad_fingerprint <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 accepted corpus fingerprint drift detected: %',v_bad_fingerprint;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE required),
         count(*) FILTER (WHERE NOT required),
         array_agg(sequence_no ORDER BY sequence_no)
    INTO v_items,v_required,v_optional,v_sequence
  FROM comind.cm_learning_path_item
  WHERE path_id=v_path_id;

  IF v_items <> 5 OR v_required <> 3 OR v_optional <> 2 THEN
    RAISE EXCEPTION 'RLIB-003 item composition drifted: items %, required %, optional %',v_items,v_required,v_optional;
  END IF;

  IF v_sequence <> ARRAY[1,2,3,4,5] THEN
    RAISE EXCEPTION 'RLIB-003 sequence drifted: %',v_sequence;
  END IF;

  SELECT count(*) INTO v_bad_required
  FROM comind.cm_learning_path_item i
  JOIN comind.cm_research_refs r ON r.ref_id=i.ref_id
  WHERE i.path_id=v_path_id
    AND i.required=true
    AND (
      r.authority_level IS DISTINCT FROM 'primary_authoritative'
      OR r.lifecycle_status IS DISTINCT FROM 'current'
      OR r.content_sha256 IS NULL
      OR r.fingerprint_algorithm IS DISTINCT FROM 'sha256:raw-bytes'
      OR (r.freshness_due_at IS NULL OR r.freshness_due_at < now())
    );

  IF v_bad_required <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 has stale, weakly fingerprinted, or non-authoritative required sources: %',v_bad_required;
  END IF;

  SELECT count(*) INTO v_bad_guidance
  FROM comind.cm_learning_path_item i
  JOIN comind.cm_research_refs r ON r.ref_id=i.ref_id
  WHERE i.path_id=v_path_id
    AND r.drive_file_id='1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx'
    AND (
      i.required=false
      AND r.authority_level='secondary_guidance'
      AND r.lifecycle_status='candidate'
      AND i.metadata->>'source_expectation'='secondary guidance, non-normative'
      AND r.metadata->>'authority_note'='secondary guidance, not ISO normative text'
    ) IS NOT TRUE;

  IF v_bad_guidance <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 secondary ISO-related guidance classification drifted';
  END IF;

  SELECT count(*) INTO v_bad_history
  FROM comind.cm_learning_path_item i
  JOIN comind.cm_research_refs draft ON draft.ref_id=i.ref_id
  LEFT JOIN comind.cm_research_refs final ON final.ref_id=draft.superseded_by_ref_id
  WHERE i.path_id=v_path_id
    AND draft.drive_file_id='19Cksd5HogXnQepDZCayPNURCmspGSBfO'
    AND (
      i.required=false
      AND draft.lifecycle_status='withdrawn'
      AND draft.superseded_by_ref_id IS NOT NULL
      AND final.drive_file_id='1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6'
      AND final.lifecycle_status='current'
    ) IS NOT TRUE;

  IF v_bad_history <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 supersession literacy source drifted';
  END IF;

  IF (SELECT count(*) FROM comind.cm_learning_path_item WHERE path_id=v_path_id AND ref_id IN (
      SELECT ref_id FROM comind.cm_research_refs
      WHERE drive_file_id IN (
        '1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx',
        '1fZ4349LhmIovoxoz20tpAbgjlXmX479T',
        '1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6',
        '1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx',
        '19Cksd5HogXnQepDZCayPNURCmspGSBfO'
      )
    )) <> 5 THEN
    RAISE EXCEPTION 'RLIB-003 does not resolve all five intended canonical Research Library records';
  END IF;
END
$$;

SELECT
  p.slug,
  p.status,
  i.sequence_no,
  i.required,
  i.section_title,
  r.title AS source_title,
  r.document_identifier,
  r.authority_level,
  r.lifecycle_status,
  r.content_sha256,
  r.freshness_due_at,
  r.superseded_by_ref_id
FROM comind.cm_learning_path p
JOIN comind.cm_learning_path_item i ON i.path_id=p.path_id
JOIN comind.cm_research_refs r ON r.ref_id=i.ref_id
WHERE p.slug='virtual-employee-standards-v0-1'
ORDER BY i.sequence_no;
