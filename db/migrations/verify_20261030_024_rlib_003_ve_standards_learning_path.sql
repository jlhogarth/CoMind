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
BEGIN
  SELECT path_id,status
    INTO STRICT v_path_id,v_status
  FROM comind.cm_learning_path
  WHERE slug='virtual-employee-standards-v0-1';

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'RLIB-003 learning path must remain draft until VE-STD-001 is accepted; status=%',v_status;
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
      r.authority_level <> 'primary_authoritative'
      OR r.lifecycle_status <> 'current'
      OR r.content_sha256 IS NULL
      OR (r.freshness_due_at IS NOT NULL AND r.freshness_due_at < now())
    );

  IF v_bad_required <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 has stale or non-authoritative required sources: %',v_bad_required;
  END IF;

  SELECT count(*) INTO v_bad_guidance
  FROM comind.cm_learning_path_item i
  JOIN comind.cm_research_refs r ON r.ref_id=i.ref_id
  WHERE i.path_id=v_path_id
    AND r.drive_file_id='1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx'
    AND NOT (
      i.required=false
      AND r.authority_level='secondary_guidance'
      AND r.lifecycle_status='candidate'
      AND i.metadata->>'source_expectation'='secondary guidance, non-normative'
    );

  IF v_bad_guidance <> 0 THEN
    RAISE EXCEPTION 'RLIB-003 secondary ISO-related guidance classification drifted';
  END IF;

  SELECT count(*) INTO v_bad_history
  FROM comind.cm_learning_path_item i
  JOIN comind.cm_research_refs draft ON draft.ref_id=i.ref_id
  LEFT JOIN comind.cm_research_refs final ON final.ref_id=draft.superseded_by_ref_id
  WHERE i.path_id=v_path_id
    AND draft.drive_file_id='19Cksd5HogXnQepDZCayPNURCmspGSBfO'
    AND NOT (
      i.required=false
      AND draft.lifecycle_status='withdrawn'
      AND draft.superseded_by_ref_id IS NOT NULL
      AND final.drive_file_id='1-uL8611hNAkgu18wjbvMpkuaQRvKCjB6'
      AND final.lifecycle_status='current'
    );

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
  r.freshness_due_at,
  r.superseded_by_ref_id
FROM comind.cm_learning_path p
JOIN comind.cm_learning_path_item i ON i.path_id=p.path_id
JOIN comind.cm_research_refs r ON r.ref_id=i.ref_id
WHERE p.slug='virtual-employee-standards-v0-1'
ORDER BY i.sequence_no;
