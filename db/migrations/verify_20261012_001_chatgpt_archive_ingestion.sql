DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(expected, ', ' ORDER BY expected)
  INTO v_missing
  FROM (
    VALUES
      ('cm_archive_source'),
      ('cm_archive_source_file'),
      ('cm_archive_import'),
      ('cm_archive_conversation_observation'),
      ('cm_archive_node_observation'),
      ('cm_archive_attachment_reference'),
      ('cm_archive_parser_event'),
      ('cm_archive_diff_receipt'),
      ('cm_archive_quarantine')
  ) AS required(expected)
  WHERE to_regclass('comind.' || expected) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing ChatGPT archive ingestion tables: %', v_missing;
  END IF;
END;
$$;

DO $$
DECLARE
  v_archive_id uuid;
  v_import_id uuid;
  v_mutation_blocked boolean := false;
BEGIN
  INSERT INTO comind.cm_archive_source (
    source_archive_name,
    source_archive_sha256,
    source_archive_bytes
  ) VALUES (
    'fixture.zip',
    repeat('a', 64),
    123
  )
  RETURNING source_archive_id INTO v_archive_id;

  INSERT INTO comind.cm_archive_source_file (
    source_archive_id,
    source_path,
    file_role,
    byte_length,
    sha256
  ) VALUES (
    v_archive_id,
    'conversations.json',
    'conversation_json',
    99,
    repeat('b', 64)
  );

  INSERT INTO comind.cm_archive_import (
    source_archive_id,
    parser_version,
    schema_version
  ) VALUES (
    v_archive_id,
    'fixture-parser',
    'fixture-schema'
  )
  RETURNING import_id INTO v_import_id;

  INSERT INTO comind.cm_archive_conversation_observation (
    import_id,
    source_conversation_id,
    title,
    source_created_at,
    source_updated_at,
    created_at,
    updated_at,
    raw_source_hash,
    normalized_hash,
    topology_hash,
    node_count,
    message_count,
    attachment_reference_count,
    raw_conversation
  ) VALUES (
    v_import_id,
    'conversation-1',
    'fixture',
    '1791840000'::jsonb,
    '1791840001'::jsonb,
    to_timestamp(1791840000),
    to_timestamp(1791840001),
    repeat('c', 64),
    repeat('d', 64),
    repeat('e', 64),
    1,
    1,
    0,
    '{"id":"conversation-1","mapping":{}}'::jsonb
  );

  INSERT INTO comind.cm_archive_node_observation (
    import_id,
    source_conversation_id,
    source_node_id,
    parent_source_node_id,
    child_source_node_ids,
    source_message_id,
    role,
    source_created_at,
    source_updated_at,
    created_at,
    updated_at,
    content_type,
    raw_node_hash,
    normalized_message_hash,
    raw_node
  ) VALUES (
    v_import_id,
    'conversation-1',
    'node-1',
    NULL,
    '[]'::jsonb,
    'message-1',
    'user',
    '1791840000'::jsonb,
    '1791840000'::jsonb,
    to_timestamp(1791840000),
    to_timestamp(1791840000),
    'text',
    repeat('f', 64),
    repeat('1', 64),
    '{"id":"node-1"}'::jsonb
  );

  BEGIN
    UPDATE comind.cm_archive_node_observation
    SET role = 'assistant'
    WHERE import_id = v_import_id
      AND source_conversation_id = 'conversation-1'
      AND source_node_id = 'node-1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'archive evidence is immutable' THEN
      v_mutation_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT v_mutation_blocked THEN
    RAISE EXCEPTION 'Archive evidence mutation was not blocked';
  END IF;

  INSERT INTO comind.cm_archive_quarantine (
    import_id,
    fragment_kind,
    source_path,
    raw_fragment,
    raw_fragment_sha256,
    reason_code,
    detail
  ) VALUES (
    v_import_id,
    'other',
    'conversations.json',
    '{"unparsed":true}'::jsonb,
    repeat('2', 64),
    'FIXTURE',
    'verification fixture'
  );

  UPDATE comind.cm_archive_import
  SET status = 'PASS',
      completed_at = now(),
      source_conversation_count = 1,
      source_message_count = 1,
      source_node_count = 1,
      source_attachment_count = 0,
      imported_conversation_count = 1,
      imported_message_count = 1,
      imported_node_count = 1,
      imported_attachment_count = 0,
      reconciliation = '{"verified":true}'::jsonb,
      receipt = '{"status":"PASS"}'::jsonb,
      receipt_sha256 = repeat('3', 64)
  WHERE import_id = v_import_id;

  BEGIN
    UPDATE comind.cm_archive_import
    SET status = 'FAIL'
    WHERE import_id = v_import_id;
    RAISE EXCEPTION 'Finalized import attempt was mutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'finalized archive import attempts are immutable' THEN
      RAISE;
    END IF;
  END;
END;
$$;
