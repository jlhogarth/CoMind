-- CFR-001F read-only Supabase Test acceptance verifier.
-- Synthetic evidence only. Does not mutate source or reconciliation records.

WITH checks(name, ok) AS (
  SELECT 'reconciler_role_hardened', EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_reconciler'
      AND rolcanlogin=false AND rolinherit=false AND rolsuper=false AND rolcreatedb=false
      AND rolcreaterole=false AND rolreplication=false AND rolbypassrls=false
  )
  UNION ALL SELECT 'reconciliation_tables_forced_rls', (
    SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind'
      AND c.relname IN ('cm_conversation_reconciliation_receipt','cm_conversation_reconciliation_candidate')
      AND c.relrowsecurity AND c.relforcerowsecurity
  )
  UNION ALL SELECT 'api_roles_no_reconciliation_access', NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role','comind_archive_ingestor']) r(role_name)
    CROSS JOIN unnest(ARRAY['cm_conversation_reconciliation_receipt','cm_conversation_reconciliation_candidate']) t(table_name)
    WHERE has_table_privilege(role_name,format('comind.%I',table_name),'SELECT')
       OR has_table_privilege(role_name,format('comind.%I',table_name),'INSERT')
       OR has_table_privilege(role_name,format('comind.%I',table_name),'UPDATE')
       OR has_table_privilege(role_name,format('comind.%I',table_name),'DELETE')
  )
  UNION ALL SELECT 'reconciler_output_append_only_acl', (
    SELECT bool_and(
      has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'SELECT')
      AND has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'INSERT')
      AND NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'UPDATE')
      AND NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'DELETE')
    ) FROM unnest(ARRAY['cm_conversation_reconciliation_receipt','cm_conversation_reconciliation_candidate']) t(table_name)
  )
  UNION ALL SELECT 'reconciler_source_read_only_acl', (
    SELECT bool_and(
      has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'SELECT')
      AND NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'INSERT')
      AND NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'UPDATE')
      AND NOT has_table_privilege('comind_conversation_reconciler',format('comind.%I',table_name),'DELETE')
    ) FROM unnest(ARRAY[
      'cm_conversation','cm_message','cm_conversation_capture_event','cm_assistant_generation',
      'cm_conversation_recovery_checkpoint','cm_archive_source','cm_archive_import',
      'cm_archive_conversation_observation','cm_archive_node_observation',
      'cm_archive_attachment_reference','cm_archive_parser_event','cm_archive_quarantine'
    ]) t(table_name)
  )
  UNION ALL SELECT 'live_policy_matches_rls_state', NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'cm_conversation','cm_message','cm_conversation_capture_event',
      'cm_assistant_generation','cm_conversation_recovery_checkpoint'
    ]) t(table_name)
    JOIN pg_class c ON c.relname=t.table_name
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='comind'
    WHERE (c.relrowsecurity AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='comind' AND p.tablename=t.table_name
        AND p.policyname='cm_conversation_reconciler_select' AND p.cmd='SELECT'
    )) OR (NOT c.relrowsecurity AND EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname='comind' AND p.tablename=t.table_name
        AND p.policyname='cm_conversation_reconciler_select'
    ))
  )
  UNION ALL SELECT 'archive_reconciler_select_policies_present', (
    SELECT count(*)=7 FROM pg_policies p
    WHERE p.schemaname='comind'
      AND p.policyname='cm_conversation_reconciler_select'
      AND p.cmd='SELECT'
      AND p.tablename IN (
        'cm_archive_source','cm_archive_import','cm_archive_conversation_observation',
        'cm_archive_node_observation','cm_archive_attachment_reference',
        'cm_archive_parser_event','cm_archive_quarantine'
      )
  )
  UNION ALL SELECT 'exact_receipt', EXISTS (
    SELECT 1 FROM comind.cm_conversation_reconciliation_receipt
    WHERE reconciliation_id='f1010001-0000-4000-8000-000000000201'
      AND result='exact_match'
      AND selected_conv_id='f1010001-0000-4000-8000-000000000001'
      AND match_method='explicit_source_id'
  )
  UNION ALL SELECT 'live_only_interrupted_extension', EXISTS (
    SELECT 1 FROM comind.cm_conversation_reconciliation_receipt
    WHERE reconciliation_id='f1020001-0000-4000-8000-000000000201'
      AND result='compatible_extension'
      AND selected_conv_id='f1020001-0000-4000-8000-000000000001'
      AND match_method='explicit_source_id'
      AND (classification_counts->>'live_only_interrupted_partial')::int=1
  )
  UNION ALL SELECT 'interrupted_partial_preserved_exactly', EXISTS (
    SELECT 1 FROM comind.cm_conversation_recovery_checkpoint
    WHERE checkpoint_id='f1020001-0000-4000-8000-000000000031'
      AND partial_assistant_content='This interrupted fragment exists only in live CFR evidence.'
      AND encode(extensions.digest(partial_assistant_content,'sha256'),'hex')
          ='a8a1b024ac0dbdfafbfa6175d74327b4f6b0d585c631ce0126925f8bf25e1ab2'
  )
  UNION ALL SELECT 'fail_closed_ambiguity', EXISTS (
    SELECT 1 FROM comind.cm_conversation_reconciliation_receipt
    WHERE reconciliation_id='f1030001-0000-4000-8000-000000000201'
      AND result='ambiguous_match' AND selected_conv_id IS NULL AND match_method='none'
      AND jsonb_array_length(unresolved)=1
  )
  UNION ALL SELECT 'test_receipt_count', (
    SELECT count(*)=3 FROM comind.cm_conversation_reconciliation_receipt
    WHERE reconciliation_id IN (
      'f1010001-0000-4000-8000-000000000201',
      'f1020001-0000-4000-8000-000000000201',
      'f1030001-0000-4000-8000-000000000201'
    )
  )
  UNION ALL SELECT 'test_candidate_count', (
    SELECT count(*)=2 FROM comind.cm_conversation_reconciliation_candidate
    WHERE reconciliation_id IN (
      'f1010001-0000-4000-8000-000000000201',
      'f1020001-0000-4000-8000-000000000201'
    )
  )
  UNION ALL SELECT 'source_live_messages_intact', (
    SELECT count(*)=4 FROM comind.cm_message
    WHERE conv_id IN (
      'f1010001-0000-4000-8000-000000000001',
      'f1020001-0000-4000-8000-000000000001'
    )
  )
  UNION ALL SELECT 'source_archive_nodes_intact', (
    SELECT count(*)=5 FROM comind.cm_archive_node_observation
    WHERE import_id IN (
      'f1010001-0000-4000-8000-000000000102',
      'f1020001-0000-4000-8000-000000000102',
      'f1030001-0000-4000-8000-000000000102'
    )
  )
  UNION ALL SELECT 'immutability_triggers_present', (
    SELECT count(*)=2
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid=tg.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND NOT tg.tgisinternal
      AND tg.tgname IN (
        'trg_cm_conversation_reconciliation_receipt_immutable',
        'trg_cm_conversation_reconciliation_candidate_immutable'
      )
  )
  UNION ALL SELECT 'trigger_helper_not_directly_executable', (
    NOT has_function_privilege('public','comind.cm_reject_reconciliation_evidence_mutation()','EXECUTE')
    AND NOT has_function_privilege('comind_conversation_reconciler','comind.cm_reject_reconciliation_evidence_mutation()','EXECUTE')
  )
  UNION ALL SELECT 'five_test_migrations_recorded', (
    SELECT count(*)=5 FROM supabase_migrations.schema_migrations
    WHERE name IN (
      'cfr_001f_native_chatgpt_live_reconciliation_v0_1',
      'cfr_001f_reconciler_live_read_boundary_v0_1_1',
      'cfr_001f_reconciliation_ambiguity_hardening_v0_1_2',
      'cfr_001f_reconciliation_snapshot_identity_v0_1_3',
      'cfr_001f_reconciliation_policy_hardening_v0_1_4'
    )
  )
)
SELECT CASE WHEN bool_and(ok) THEN 'PASS' ELSE 'FAIL' END AS result,
       jsonb_object_agg(name,ok ORDER BY name) AS checks
FROM checks;
