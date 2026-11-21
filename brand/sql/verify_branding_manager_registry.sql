BEGIN;

DO $verify$
DECLARE
    missing_count integer;
BEGIN
    SELECT count(*)
      INTO missing_count
      FROM (VALUES
        ('brand_profile'),
        ('brand_profile_version'),
        ('scope_definition'),
        ('experience_mode'),
        ('layout_preset'),
        ('application_binding'),
        ('brand_event')
      ) AS expected(table_name)
      WHERE to_regclass('comind_brand.' || expected.table_name) IS NULL;

    IF missing_count <> 0 THEN
        RAISE EXCEPTION 'Brand registry verification failed: % required tables are missing', missing_count;
    END IF;

    IF to_regclass('comind_brand.brand_profile_one_accepted_version') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: accepted-version uniqueness index is missing';
    END IF;

    IF to_regprocedure('comind_brand.reject_brand_event_mutation()') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: append-only event guard is missing';
    END IF;

    IF to_regprocedure('comind_brand.guard_brand_version_mutation()') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: version immutability guard is missing';
    END IF;

    IF to_regprocedure('comind_brand.guard_application_binding()') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: application binding guard is missing';
    END IF;

    IF to_regclass('comind_brand.accepted_profile_catalog') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: accepted profile catalog view is missing';
    END IF;

    IF to_regclass('comind_brand.application_brand_catalog') IS NULL THEN
        RAISE EXCEPTION 'Brand registry verification failed: application brand catalog view is missing';
    END IF;
END;
$verify$;

DO $behavior$
DECLARE
    profile_id bigint;
    version_id bigint;
    event_id bigint;
    mutation_blocked boolean := false;
BEGIN
    INSERT INTO comind_brand.brand_profile (
        profile_key,
        display_name,
        description,
        created_by
    )
    VALUES (
        'verification_profile',
        'Verification Profile',
        'Synthetic fixture used only inside the BRAND-001 transactional verification script.',
        'brand_registry_verification'
    )
    RETURNING brand_profile_id INTO profile_id;

    INSERT INTO comind_brand.brand_profile_version (
        brand_profile_id,
        version_number,
        lifecycle_state,
        token_document,
        motion_policy,
        layout_policy,
        accessibility_policy,
        source_commit_sha,
        created_by
    )
    VALUES (
        profile_id,
        1,
        'draft',
        '{"accent":"semantic"}'::jsonb,
        '{"mode":"operational"}'::jsonb,
        '{"shell":"responsive"}'::jsonb,
        '{"reduced_motion":"required"}'::jsonb,
        '487e927704ed70c415eecea3a8d33bdaf5f38bd5',
        'brand_registry_verification'
    )
    RETURNING brand_profile_version_id INTO version_id;

    INSERT INTO comind_brand.scope_definition (
        brand_profile_version_id,
        scope_key,
        semantic_role,
        token_overrides,
        usage_rule
    )
    VALUES (
        version_id,
        'cognition',
        'cognition',
        '{"accent":"caribbean"}'::jsonb,
        'Verification fixture for semantic scope registration.'
    );

    INSERT INTO comind_brand.experience_mode (
        brand_profile_version_id,
        mode_key,
        intensity_rank,
        field_policy,
        motion_policy,
        description
    )
    VALUES (
        version_id,
        'operational',
        2,
        '{"field":"active"}'::jsonb,
        '{"motion":"bounded"}'::jsonb,
        'Verification fixture for operational experience mode.'
    );

    UPDATE comind_brand.brand_profile_version
       SET lifecycle_state = 'accepted',
           accepted_at = now(),
           accepted_by = 'brand_registry_verification'
     WHERE brand_profile_version_id = version_id;

    INSERT INTO comind_brand.brand_event (
        brand_profile_version_id,
        event_type,
        actor_ref,
        evidence
    )
    VALUES (
        version_id,
        'validation_recorded',
        'brand_registry_verification',
        '{"fixture":true}'::jsonb
    )
    RETURNING brand_event_id INTO event_id;

    BEGIN
        UPDATE comind_brand.brand_event
           SET actor_ref = 'mutation_should_be_blocked'
         WHERE brand_event_id = event_id;
    EXCEPTION
        WHEN SQLSTATE '55000' THEN
            mutation_blocked := true;
    END;

    IF mutation_blocked IS NOT TRUE THEN
        RAISE EXCEPTION 'Brand registry verification failed: append-only event mutation was not blocked';
    END IF;

    mutation_blocked := false;

    BEGIN
        UPDATE comind_brand.brand_profile_version
           SET token_document = '{"unexpected":"mutation"}'::jsonb
         WHERE brand_profile_version_id = version_id;
    EXCEPTION
        WHEN SQLSTATE '55000' THEN
            mutation_blocked := true;
    END;

    IF mutation_blocked IS NOT TRUE THEN
        RAISE EXCEPTION 'Brand registry verification failed: accepted version content mutation was not blocked';
    END IF;
END;
$behavior$;

ROLLBACK;
