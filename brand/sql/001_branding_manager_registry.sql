BEGIN;

CREATE SCHEMA IF NOT EXISTS comind_brand;

REVOKE ALL ON SCHEMA comind_brand FROM PUBLIC;

CREATE TABLE IF NOT EXISTS comind_brand.brand_profile (
    brand_profile_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_key text NOT NULL UNIQUE,
    display_name text NOT NULL,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    CONSTRAINT brand_profile_key_format
      CHECK (profile_key ~ '^[a-z][a-z0-9_]{2,63}$'),
    CONSTRAINT brand_profile_display_name_nonblank
      CHECK (btrim(display_name) <> ''),
    CONSTRAINT brand_profile_description_nonblank
      CHECK (btrim(description) <> ''),
    CONSTRAINT brand_profile_created_by_nonblank
      CHECK (btrim(created_by) <> '')
);

CREATE TABLE IF NOT EXISTS comind_brand.brand_profile_version (
    brand_profile_version_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_profile_id bigint NOT NULL
      REFERENCES comind_brand.brand_profile(brand_profile_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    version_number integer NOT NULL,
    lifecycle_state text NOT NULL DEFAULT 'draft',
    token_document jsonb NOT NULL,
    motion_policy jsonb NOT NULL,
    layout_policy jsonb NOT NULL,
    accessibility_policy jsonb NOT NULL,
    source_commit_sha text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    accepted_at timestamptz,
    accepted_by text,
    CONSTRAINT brand_profile_version_unique UNIQUE (brand_profile_id, version_number),
    CONSTRAINT brand_profile_version_positive CHECK (version_number > 0),
    CONSTRAINT brand_profile_version_state
      CHECK (lifecycle_state IN ('draft', 'accepted', 'retired')),
    CONSTRAINT brand_profile_version_documents_are_objects
      CHECK (
        jsonb_typeof(token_document) = 'object'
        AND jsonb_typeof(motion_policy) = 'object'
        AND jsonb_typeof(layout_policy) = 'object'
        AND jsonb_typeof(accessibility_policy) = 'object'
      ),
    CONSTRAINT brand_profile_version_commit_sha_format
      CHECK (
        source_commit_sha IS NULL
        OR source_commit_sha ~ '^[0-9a-f]{40}$'
      ),
    CONSTRAINT brand_profile_version_created_by_nonblank
      CHECK (btrim(created_by) <> ''),
    CONSTRAINT brand_profile_version_acceptance_consistency
      CHECK (
        (lifecycle_state = 'draft' AND accepted_at IS NULL AND accepted_by IS NULL)
        OR
        (lifecycle_state IN ('accepted', 'retired') AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND btrim(accepted_by) <> '')
      )
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_profile_one_accepted_version
    ON comind_brand.brand_profile_version (brand_profile_id)
    WHERE lifecycle_state = 'accepted';

CREATE TABLE IF NOT EXISTS comind_brand.scope_definition (
    scope_definition_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_profile_version_id bigint NOT NULL
      REFERENCES comind_brand.brand_profile_version(brand_profile_version_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    scope_key text NOT NULL,
    semantic_role text NOT NULL,
    token_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
    usage_rule text NOT NULL,
    CONSTRAINT scope_definition_unique
      UNIQUE (brand_profile_version_id, scope_key),
    CONSTRAINT scope_definition_key_format
      CHECK (scope_key ~ '^[a-z][a-z0-9_-]{1,47}$'),
    CONSTRAINT scope_definition_role
      CHECK (semantic_role IN ('cognition', 'operator', 'governance', 'success', 'warning', 'danger', 'product')),
    CONSTRAINT scope_definition_token_overrides_object
      CHECK (jsonb_typeof(token_overrides) = 'object'),
    CONSTRAINT scope_definition_usage_rule_nonblank
      CHECK (btrim(usage_rule) <> '')
);

CREATE TABLE IF NOT EXISTS comind_brand.experience_mode (
    experience_mode_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_profile_version_id bigint NOT NULL
      REFERENCES comind_brand.brand_profile_version(brand_profile_version_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    mode_key text NOT NULL,
    intensity_rank smallint NOT NULL,
    field_policy jsonb NOT NULL,
    motion_policy jsonb NOT NULL,
    description text NOT NULL,
    CONSTRAINT experience_mode_unique
      UNIQUE (brand_profile_version_id, mode_key),
    CONSTRAINT experience_mode_key
      CHECK (mode_key IN ('calm', 'operational', 'cinematic')),
    CONSTRAINT experience_mode_intensity
      CHECK (intensity_rank BETWEEN 1 AND 3),
    CONSTRAINT experience_mode_documents_are_objects
      CHECK (
        jsonb_typeof(field_policy) = 'object'
        AND jsonb_typeof(motion_policy) = 'object'
      ),
    CONSTRAINT experience_mode_description_nonblank
      CHECK (btrim(description) <> '')
);

CREATE TABLE IF NOT EXISTS comind_brand.layout_preset (
    layout_preset_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_profile_version_id bigint NOT NULL
      REFERENCES comind_brand.brand_profile_version(brand_profile_version_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    preset_key text NOT NULL,
    layout_contract jsonb NOT NULL,
    description text NOT NULL,
    CONSTRAINT layout_preset_unique
      UNIQUE (brand_profile_version_id, preset_key),
    CONSTRAINT layout_preset_key_format
      CHECK (preset_key ~ '^[a-z][a-z0-9_-]{1,47}$'),
    CONSTRAINT layout_preset_contract_object
      CHECK (jsonb_typeof(layout_contract) = 'object'),
    CONSTRAINT layout_preset_description_nonblank
      CHECK (btrim(description) <> '')
);

CREATE TABLE IF NOT EXISTS comind_brand.application_binding (
    application_binding_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_key text NOT NULL UNIQUE,
    brand_profile_version_id bigint NOT NULL
      REFERENCES comind_brand.brand_profile_version(brand_profile_version_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    default_scope_key text NOT NULL,
    default_experience_mode text NOT NULL,
    binding_state text NOT NULL DEFAULT 'planned',
    bound_at timestamptz,
    bound_by text,
    notes text NOT NULL DEFAULT '',
    CONSTRAINT application_binding_key_format
      CHECK (application_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
    CONSTRAINT application_binding_experience_mode
      CHECK (default_experience_mode IN ('calm', 'operational', 'cinematic')),
    CONSTRAINT application_binding_state
      CHECK (binding_state IN ('planned', 'testing', 'active', 'retired')),
    CONSTRAINT application_binding_scope_fk
      FOREIGN KEY (brand_profile_version_id, default_scope_key)
      REFERENCES comind_brand.scope_definition(brand_profile_version_id, scope_key)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    CONSTRAINT application_binding_mode_fk
      FOREIGN KEY (brand_profile_version_id, default_experience_mode)
      REFERENCES comind_brand.experience_mode(brand_profile_version_id, mode_key)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    CONSTRAINT application_binding_activation_consistency
      CHECK (
        (binding_state IN ('planned', 'testing') AND bound_at IS NULL AND bound_by IS NULL)
        OR
        (binding_state IN ('active', 'retired') AND bound_at IS NOT NULL AND bound_by IS NOT NULL AND btrim(bound_by) <> '')
      )
);

CREATE TABLE IF NOT EXISTS comind_brand.brand_event (
    brand_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brand_profile_version_id bigint
      REFERENCES comind_brand.brand_profile_version(brand_profile_version_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    application_binding_id bigint
      REFERENCES comind_brand.application_binding(application_binding_id)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT,
    event_type text NOT NULL,
    actor_ref text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT brand_event_type
      CHECK (event_type IN (
        'version_created',
        'version_accepted',
        'version_retired',
        'binding_planned',
        'binding_testing',
        'binding_activated',
        'binding_retired',
        'validation_recorded'
      )),
    CONSTRAINT brand_event_actor_nonblank
      CHECK (btrim(actor_ref) <> ''),
    CONSTRAINT brand_event_evidence_object
      CHECK (jsonb_typeof(evidence) = 'object')
);

CREATE INDEX IF NOT EXISTS brand_event_version_time_idx
    ON comind_brand.brand_event (brand_profile_version_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS brand_event_binding_time_idx
    ON comind_brand.brand_event (application_binding_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION comind_brand.reject_brand_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
      'comind_brand.brand_event is append-only; % is not permitted',
      TG_OP
      USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS brand_event_append_only_update
    ON comind_brand.brand_event;
CREATE TRIGGER brand_event_append_only_update
BEFORE UPDATE ON comind_brand.brand_event
FOR EACH ROW
EXECUTE FUNCTION comind_brand.reject_brand_event_mutation();

DROP TRIGGER IF EXISTS brand_event_append_only_delete
    ON comind_brand.brand_event;
CREATE TRIGGER brand_event_append_only_delete
BEFORE DELETE ON comind_brand.brand_event
FOR EACH ROW
EXECUTE FUNCTION comind_brand.reject_brand_event_mutation();

CREATE OR REPLACE FUNCTION comind_brand.guard_brand_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.lifecycle_state = 'retired' THEN
        RAISE EXCEPTION
          'retired brand profile versions are immutable'
          USING ERRCODE = '55000';
    END IF;

    IF OLD.lifecycle_state = 'accepted' THEN
        IF NEW.lifecycle_state <> 'retired' THEN
            RAISE EXCEPTION
              'accepted brand profile versions may only transition to retired'
              USING ERRCODE = '55000';
        END IF;

        IF ROW(
            NEW.brand_profile_id,
            NEW.version_number,
            NEW.token_document,
            NEW.motion_policy,
            NEW.layout_policy,
            NEW.accessibility_policy,
            NEW.source_commit_sha,
            NEW.created_at,
            NEW.created_by,
            NEW.accepted_at,
            NEW.accepted_by
        ) IS DISTINCT FROM ROW(
            OLD.brand_profile_id,
            OLD.version_number,
            OLD.token_document,
            OLD.motion_policy,
            OLD.layout_policy,
            OLD.accessibility_policy,
            OLD.source_commit_sha,
            OLD.created_at,
            OLD.created_by,
            OLD.accepted_at,
            OLD.accepted_by
        ) THEN
            RAISE EXCEPTION
              'accepted brand profile content is immutable; create a new version'
              USING ERRCODE = '55000';
        END IF;
    END IF;

    IF OLD.lifecycle_state = 'draft'
       AND NEW.lifecycle_state NOT IN ('draft', 'accepted') THEN
        RAISE EXCEPTION
          'draft brand profile versions may only remain draft or transition to accepted'
          USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_profile_version_guard
    ON comind_brand.brand_profile_version;
CREATE TRIGGER brand_profile_version_guard
BEFORE UPDATE ON comind_brand.brand_profile_version
FOR EACH ROW
EXECUTE FUNCTION comind_brand.guard_brand_version_mutation();

CREATE OR REPLACE FUNCTION comind_brand.guard_application_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    version_state text;
BEGIN
    SELECT lifecycle_state
      INTO version_state
      FROM comind_brand.brand_profile_version
     WHERE brand_profile_version_id = NEW.brand_profile_version_id;

    IF version_state IS NULL THEN
        RAISE EXCEPTION
          'brand profile version % does not exist',
          NEW.brand_profile_version_id
          USING ERRCODE = '23503';
    END IF;

    IF NEW.binding_state = 'active' AND version_state <> 'accepted' THEN
        RAISE EXCEPTION
          'active application bindings require an accepted brand profile version'
          USING ERRCODE = '55000';
    END IF;

    IF NEW.binding_state = 'retired' AND version_state NOT IN ('accepted', 'retired') THEN
        RAISE EXCEPTION
          'retired application bindings require an accepted or retired brand profile version'
          USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_binding_guard
    ON comind_brand.application_binding;
CREATE TRIGGER application_binding_guard
BEFORE INSERT OR UPDATE ON comind_brand.application_binding
FOR EACH ROW
EXECUTE FUNCTION comind_brand.guard_application_binding();

CREATE OR REPLACE VIEW comind_brand.accepted_profile_catalog AS
SELECT
    p.profile_key,
    p.display_name,
    v.brand_profile_version_id,
    v.version_number,
    v.source_commit_sha,
    v.accepted_at,
    v.accepted_by
FROM comind_brand.brand_profile AS p
JOIN comind_brand.brand_profile_version AS v
  ON v.brand_profile_id = p.brand_profile_id
WHERE v.lifecycle_state = 'accepted';

CREATE OR REPLACE VIEW comind_brand.application_brand_catalog AS
SELECT
    b.application_key,
    b.binding_state,
    b.default_scope_key,
    b.default_experience_mode,
    p.profile_key,
    v.version_number,
    v.lifecycle_state AS profile_version_state,
    v.source_commit_sha,
    b.bound_at,
    b.bound_by
FROM comind_brand.application_binding AS b
JOIN comind_brand.brand_profile_version AS v
  ON v.brand_profile_version_id = b.brand_profile_version_id
JOIN comind_brand.brand_profile AS p
  ON p.brand_profile_id = v.brand_profile_id;

COMMENT ON SCHEMA comind_brand IS
'Versioned CoMind visual-system registry. Presentation metadata only; it confers no application or security authority.';

COMMENT ON TABLE comind_brand.brand_profile_version IS
'Immutable after acceptance except for the accepted-to-retired lifecycle transition.';

COMMENT ON TABLE comind_brand.brand_event IS
'Append-only evidence stream for branding lifecycle and application binding events.';

COMMIT;
