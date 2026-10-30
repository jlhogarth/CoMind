\set ON_ERROR_STOP on

BEGIN;

INSERT INTO comind.cm_conversation (conv_id, org_id, project_id, source, title, metadata)
SELECT
  'c0020000-0000-4000-8000-000000000001'::uuid,
  p.org_id,
  p.project_id,
  'cfr_002_synthetic',
  'CFR-002 isolated dual-acquisition proof',
  '{"synthetic":true,"private_capture":false,"provider_call":false}'::jsonb
FROM comind.cm_project p
ORDER BY p.created_at, p.project_id
LIMIT 1
ON CONFLICT (conv_id) DO NOTHING;

DO $$
DECLARE
  v_role record;
  v_table text;
BEGIN
  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
         rolreplication, rolbypassrls
    INTO v_role
  FROM pg_roles
  WHERE rolname = 'comind_conversation_acquisition_writer';

  IF NOT FOUND
     OR v_role.rolcanlogin
     OR v_role.rolinherit
     OR v_role.rolsuper
     OR v_role.rolcreatedb
     OR v_role.rolcreaterole
     OR v_role.rolreplication
     OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'CFR-002 acquisition writer role missing or over-privileged: %', row_to_json(v_role);
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation_acquisition_observation',
    'cm_conversation_acquisition_normalization',
    'cm_conversation_acquisition_reconciliation'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'comind'
        AND c.relname = v_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'CFR-002 table % lacks forced RLS', v_table;
    END IF;

    IF NOT has_table_privilege(
      'comind_conversation_acquisition_writer', format('comind.%I', v_table), 'SELECT'
    ) OR NOT has_table_privilege(
      'comind_conversation_acquisition_writer', format('comind.%I', v_table), 'INSERT'
    ) OR has_table_privilege(
      'comind_conversation_acquisition_writer', format('comind.%I', v_table), 'UPDATE'
    ) OR has_table_privilege(
      'comind_conversation_acquisition_writer', format('comind.%I', v_table), 'DELETE'
    ) THEN
      RAISE EXCEPTION 'CFR-002 privilege shape invalid for %', v_table;
    END IF;
  END LOOP;
END
$$;

SET ROLE comind_conversation_acquisition_writer;

INSERT INTO comind.cm_conversation_acquisition_observation (
  acquisition_observation_id,
  conv_id,
  source_family,
  source_stream_ref,
  source_event_family,
  source_event_ref,
  source_sequence_no,
  source_endpoint_family,
  source_observed_at,
  raw_envelope_sha256,
  raw_envelope_bytes,
  raw_object_ref,
  acquisition_metadata
) VALUES
(
  'c0020000-0000-4000-8000-000000000101'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'openai_api',
  'resp_synthetic_1',
  'response.output_text.delta',
  'api_event_1',
  1,
  'responses',
  '2026-10-30T12:00:00Z'::timestamptz,
  repeat('a', 64),
  128,
  'cfr002://synthetic/openai/1',
  '{"synthetic":true}'::jsonb
),
(
  'c0020000-0000-4000-8000-000000000102'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'openai_api',
  'resp_synthetic_1',
  'response.output_text.delta',
  'api_event_1',
  1,
  'responses',
  '2026-10-30T12:00:00.010Z'::timestamptz,
  repeat('a', 64),
  128,
  'cfr002://synthetic/openai/1-replay',
  '{"synthetic":true,"replayed":true}'::jsonb
),
(
  'c0020000-0000-4000-8000-000000000103'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'chatgpt_browser_observed',
  'browser_synthetic_1',
  'assistant_delta',
  'browser_event_2',
  2,
  'synthetic-browser-adapter',
  '2026-10-30T12:00:00.020Z'::timestamptz,
  repeat('b', 64),
  141,
  'cfr002://synthetic/browser/2',
  '{"synthetic":true}'::jsonb
),
(
  'c0020000-0000-4000-8000-000000000104'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'chatgpt_browser_observed',
  'browser_synthetic_1',
  'assistant_delta',
  'browser_event_1',
  1,
  'synthetic-browser-adapter',
  '2026-10-30T12:00:00.030Z'::timestamptz,
  repeat('c', 64),
  139,
  'cfr002://synthetic/browser/1-late',
  '{"synthetic":true,"arrived_late":true}'::jsonb
),
(
  'c0020000-0000-4000-8000-000000000105'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'chatgpt_browser_observed',
  'browser_synthetic_1',
  'future_private_event_shape',
  'browser_event_drift',
  3,
  'synthetic-browser-adapter',
  '2026-10-30T12:00:00.040Z'::timestamptz,
  repeat('d', 64),
  77,
  'cfr002://synthetic/browser/drift',
  '{"synthetic":true,"schema_drift_fixture":true}'::jsonb
);

INSERT INTO comind.cm_conversation_acquisition_normalization (
  normalization_id,
  acquisition_observation_id,
  normalizer_version,
  status,
  normalization_class,
  related_observation_id,
  detail,
  evidence,
  normalized_sha256
) VALUES
(
  'c0020000-0000-4000-8000-000000000201'::uuid,
  'c0020000-0000-4000-8000-000000000101'::uuid,
  'cfr-002-v0.1',
  'normalized',
  'assistant_text_delta',
  NULL,
  'Synthetic supported API delta normalized.',
  '{"content":"Durable "}'::jsonb,
  repeat('1', 64)
),
(
  'c0020000-0000-4000-8000-000000000202'::uuid,
  'c0020000-0000-4000-8000-000000000102'::uuid,
  'cfr-002-v0.1',
  'duplicate',
  'assistant_text_delta',
  'c0020000-0000-4000-8000-000000000101'::uuid,
  'Exact replay remains an immutable observation.',
  '{"same_source_event_ref":true,"same_digest":true}'::jsonb,
  repeat('2', 64)
),
(
  'c0020000-0000-4000-8000-000000000203'::uuid,
  'c0020000-0000-4000-8000-000000000103'::uuid,
  'cfr-002-v0.1',
  'normalized',
  'assistant_text_delta',
  NULL,
  'Synthetic browser delta normalized.',
  '{"content":"Durable "}'::jsonb,
  repeat('3', 64)
),
(
  'c0020000-0000-4000-8000-000000000204'::uuid,
  'c0020000-0000-4000-8000-000000000104'::uuid,
  'cfr-002-v0.1',
  'out_of_order',
  'assistant_text_delta',
  'c0020000-0000-4000-8000-000000000103'::uuid,
  'Source sequence one arrived after source sequence two.',
  '{"previous_source_sequence":2,"current_source_sequence":1}'::jsonb,
  repeat('4', 64)
),
(
  'c0020000-0000-4000-8000-000000000205'::uuid,
  'c0020000-0000-4000-8000-000000000105'::uuid,
  'cfr-002-v0.1',
  'schema_drift',
  NULL,
  NULL,
  'Unknown browser-observed event shape preserved without guessed meaning.',
  '{"raw_digest_preserved":true}'::jsonb,
  repeat('5', 64)
);

INSERT INTO comind.cm_conversation_acquisition_reconciliation (
  acquisition_reconciliation_id,
  conv_id,
  left_source_family,
  left_source_stream_ref,
  right_source_family,
  right_source_stream_ref,
  comparison_version,
  result,
  evidence,
  receipt_sha256
) VALUES (
  'c0020000-0000-4000-8000-000000000301'::uuid,
  'c0020000-0000-4000-8000-000000000001'::uuid,
  'openai_api',
  'resp_synthetic_1',
  'chatgpt_browser_observed',
  'browser_synthetic_1',
  'cfr-002-compare-v0.1',
  'compatible_extension',
  '{"source_overwrite":false,"synthetic":true}'::jsonb,
  repeat('6', 64)
);

RESET ROLE;

DO $$
DECLARE
  v_observations bigint;
  v_duplicate_arrivals bigint;
  v_duplicate_status bigint;
  v_out_of_order_status bigint;
  v_drift_status bigint;
  v_reconciliations bigint;
  v_first_browser_acquisition bigint;
  v_late_browser_acquisition bigint;
  v_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_observations
  FROM comind.cm_conversation_acquisition_observation
  WHERE conv_id = 'c0020000-0000-4000-8000-000000000001'::uuid;

  SELECT count(*) INTO v_duplicate_arrivals
  FROM comind.cm_conversation_acquisition_observation
  WHERE source_family = 'openai_api'
    AND source_stream_ref = 'resp_synthetic_1'
    AND source_event_ref = 'api_event_1';

  SELECT count(*) FILTER (WHERE status = 'duplicate'),
         count(*) FILTER (WHERE status = 'out_of_order'),
         count(*) FILTER (WHERE status = 'schema_drift')
    INTO v_duplicate_status, v_out_of_order_status, v_drift_status
  FROM comind.cm_conversation_acquisition_normalization n
  JOIN comind.cm_conversation_acquisition_observation o
    ON o.acquisition_observation_id = n.acquisition_observation_id
  WHERE o.conv_id = 'c0020000-0000-4000-8000-000000000001'::uuid;

  SELECT count(*) INTO v_reconciliations
  FROM comind.cm_conversation_acquisition_reconciliation
  WHERE conv_id = 'c0020000-0000-4000-8000-000000000001'::uuid;

  SELECT acquisition_sequence INTO v_first_browser_acquisition
  FROM comind.cm_conversation_acquisition_observation
  WHERE acquisition_observation_id = 'c0020000-0000-4000-8000-000000000103'::uuid;

  SELECT acquisition_sequence INTO v_late_browser_acquisition
  FROM comind.cm_conversation_acquisition_observation
  WHERE acquisition_observation_id = 'c0020000-0000-4000-8000-000000000104'::uuid;

  IF v_observations <> 5
     OR v_duplicate_arrivals <> 2
     OR v_duplicate_status <> 1
     OR v_out_of_order_status <> 1
     OR v_drift_status <> 1
     OR v_reconciliations <> 1
     OR v_late_browser_acquisition <= v_first_browser_acquisition THEN
    RAISE EXCEPTION
      'CFR-002 evidence proof failed observations=% duplicate_arrivals=% duplicate_status=% out_of_order=% drift=% reconciliations=% browser_acquisition_order=%/%',
      v_observations,
      v_duplicate_arrivals,
      v_duplicate_status,
      v_out_of_order_status,
      v_drift_status,
      v_reconciliations,
      v_first_browser_acquisition,
      v_late_browser_acquisition;
  END IF;

  BEGIN
    UPDATE comind.cm_conversation_acquisition_observation
    SET raw_envelope_bytes = raw_envelope_bytes + 1
    WHERE acquisition_observation_id = 'c0020000-0000-4000-8000-000000000101'::uuid;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable CFR-002 acquisition evidence%' THEN
      v_blocked := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'CFR-002 observation mutation was not blocked';
  END IF;
END
$$;

SELECT
  'PASS' AS cfr_002_dual_acquisition,
  5 AS immutable_observations,
  2 AS preserved_duplicate_arrivals,
  1 AS explicit_out_of_order,
  1 AS explicit_schema_drift,
  1 AS reconciliation_receipt;

ROLLBACK;
