-- CFR-001G read-only Supabase Test acceptance verifier.
-- Synthetic evidence only. Does not mutate source, derivation, projection,
-- promotion-candidate, or canonical-memory records.

WITH checks(name, ok) AS (
  VALUES
    ('migration_012_present', EXISTS(
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name='cfr_001g_conversation_analytics_intent_derivation_v0_1'
    )),
    ('migration_013_present', EXISTS(
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE name='cfr_001g_conversation_analytics_policy_hardening_v0_1_1'
    )),
    ('deriver_role_hardened', EXISTS(
      SELECT 1 FROM pg_roles
      WHERE rolname='comind_conversation_deriver'
        AND NOT rolcanlogin
        AND NOT rolinherit
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolreplication
        AND NOT rolbypassrls
    )),
    ('evidence_tables_forced_rls', (
      SELECT count(*)=3
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='comind'
        AND c.relname IN (
          'cm_conversation_derivation_run',
          'cm_conversation_derivation',
          'cm_conversation_promotion_candidate'
        )
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    )),
    ('api_roles_cannot_access_derived_objects', NOT EXISTS(
      SELECT 1
      FROM (VALUES ('anon'),('authenticated'),('service_role')) r(role_name)
      CROSS JOIN (VALUES
        ('cm_conversation_derivation_run'),
        ('cm_conversation_derivation'),
        ('cm_conversation_promotion_candidate'),
        ('cm_message_analytics'),
        ('cm_conversation_analytics')
      ) t(table_name)
      WHERE has_table_privilege(
        r.role_name,
        format('comind.%I',t.table_name),
        'SELECT,INSERT,UPDATE,DELETE'
      )
    )),
    ('deriver_has_no_memory_access', NOT has_table_privilege(
      'comind_conversation_deriver',
      'comind.cm_memory_node',
      'SELECT,INSERT,UPDATE,DELETE'
    )),
    ('deriver_sources_read_only', (
      SELECT bool_and(
        has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'SELECT'
        )
        AND NOT has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'INSERT,UPDATE,DELETE'
        )
      )
      FROM (VALUES
        ('cm_conversation'),
        ('cm_message'),
        ('cm_assistant_generation'),
        ('cm_conversation_capture_event'),
        ('cm_conversation_recovery_checkpoint')
      ) s(table_name)
    )),
    ('deriver_evidence_append_only', (
      SELECT bool_and(
        has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'SELECT,INSERT'
        )
        AND NOT has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'UPDATE,DELETE'
        )
      )
      FROM (VALUES
        ('cm_conversation_derivation_run'),
        ('cm_conversation_derivation'),
        ('cm_conversation_promotion_candidate')
      ) s(table_name)
    )),
    ('deriver_projections_upsert_only', (
      SELECT bool_and(
        has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'SELECT,INSERT,UPDATE'
        )
        AND NOT has_table_privilege(
          'comind_conversation_deriver',
          format('comind.%I',table_name),
          'DELETE'
        )
      )
      FROM (VALUES
        ('cm_message_analytics'),
        ('cm_conversation_analytics')
      ) s(table_name)
    )),
    ('redundant_deriver_source_policies_absent', NOT EXISTS(
      SELECT 1
      FROM pg_policies
      WHERE schemaname='comind'
        AND tablename IN ('cm_conversation','cm_message')
        AND policyname='cm_conversation_deriver_select'
    )),
    ('synthetic_run_exactly_one', (
      SELECT count(*)=1
      FROM comind.cm_conversation_derivation_run
      WHERE conv_id='72000000-0000-4000-8000-000000000001'
    )),
    ('synthetic_typed_derivations_exactly_three', (
      SELECT count(*)=3
      FROM comind.cm_conversation_derivation
      WHERE conv_id='72000000-0000-4000-8000-000000000001'
    )),
    ('synthetic_live_partial_exact', EXISTS(
      SELECT 1
      FROM comind.cm_conversation_derivation
      WHERE conv_id='72000000-0000-4000-8000-000000000001'
        AND source_kind='live_partial'
        AND checkpoint_id='72000000-0000-4000-8000-000000000031'
        AND value_text='This interrupted response is evidence, not a canonical completed assistant message.'
        AND metadata->>'canonical_message'='false'
    )),
    ('synthetic_unresolved_thread_present', EXISTS(
      SELECT 1
      FROM comind.cm_conversation_derivation
      WHERE conv_id='72000000-0000-4000-8000-000000000001'
        AND derivation_kind='unresolved_thread'
        AND value_text='What remains after a timeout?'
    )),
    ('synthetic_promotion_candidate_review_only', EXISTS(
      SELECT 1
      FROM comind.cm_conversation_promotion_candidate
      WHERE candidate_id='72000000-0000-4000-8000-000000000121'
        AND target_type='rule'
        AND evidence->>'review_only'='true'
    )),
    ('synthetic_message_projections_two', (
      SELECT count(*)=2
      FROM comind.cm_message_analytics ma
      JOIN comind.cm_message m ON m.msg_id=ma.msg_id
      WHERE m.conv_id='72000000-0000-4000-8000-000000000001'
    )),
    ('synthetic_conversation_projection_one', (
      SELECT count(*)=1
      FROM comind.cm_conversation_analytics
      WHERE conv_id='72000000-0000-4000-8000-000000000001'
    )),
    ('synthetic_sentiment_not_invented', NOT EXISTS(
      SELECT 1
      FROM comind.cm_message_analytics ma
      JOIN comind.cm_message m ON m.msg_id=ma.msg_id
      WHERE m.conv_id='72000000-0000-4000-8000-000000000001'
        AND ma.sentiment IS NOT NULL
    )),
    ('synthetic_no_memory_promotion', NOT EXISTS(
      SELECT 1
      FROM comind.cm_memory_node
      WHERE json_payload::text LIKE '%72000000-0000-4000-8000-000000000001%'
    )),
    ('immutable_evidence_triggers_present', (
      SELECT count(*)=3
      FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal
        AND n.nspname='comind'
        AND c.relname IN (
          'cm_conversation_derivation_run',
          'cm_conversation_derivation',
          'cm_conversation_promotion_candidate'
        )
        AND t.tgname IN (
          'trg_cm_conversation_derivation_run_immutable',
          'trg_cm_conversation_derivation_immutable',
          'trg_cm_conversation_promotion_candidate_immutable'
        )
    ))
)
SELECT bool_and(ok) AS acceptance_pass,
       count(*) FILTER (WHERE ok) AS passed_checks,
       count(*) AS total_checks,
       jsonb_object_agg(name,ok ORDER BY name) AS checks
FROM checks;
