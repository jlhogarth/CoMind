BEGIN;

SET search_path TO comind, comind_pm, public;

ALTER TABLE comind.cm_research_refs
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS document_identifier text,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'web_reference',
  ADD COLUMN IF NOT EXISTS authority_level text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS version_label text,
  ADD COLUMN IF NOT EXISTS published_on date,
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS byte_size bigint,
  ADD COLUMN IF NOT EXISTS content_sha256 char(64),
  ADD COLUMN IF NOT EXISTS observed_fingerprint text,
  ADD COLUMN IF NOT EXISTS fingerprint_algorithm text,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS freshness_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_ref_id uuid,
  ADD COLUMN IF NOT EXISTS research_session_id uuid,
  ADD COLUMN IF NOT EXISTS source_link_id uuid,
  ADD COLUMN IF NOT EXISTS related_capabilities text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_source_kind_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_source_kind_ck
      CHECK (source_kind IN (
        'standard','framework','profile','playbook','guidance','draft',
        'paper','report','documentation','web_reference','repository',
        'policy','other'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_authority_level_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_authority_level_ck
      CHECK (authority_level IN (
        'official_standard','primary_authoritative','secondary_guidance',
        'internal_canonical','community','unverified'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_lifecycle_status_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_lifecycle_status_ck
      CHECK (lifecycle_status IN (
        'candidate','current','superseded','withdrawn','retired',
        'historical','rejected'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_content_sha256_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_content_sha256_ck
      CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_byte_size_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_byte_size_ck
      CHECK (byte_size IS NULL OR byte_size >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_supersession_self_ck'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_supersession_self_ck
      CHECK (superseded_by_ref_id IS NULL OR superseded_by_ref_id <> ref_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cm_research_refs_superseded_by_fk'
      AND conrelid = 'comind.cm_research_refs'::regclass
  ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_superseded_by_fk
      FOREIGN KEY (superseded_by_ref_id)
      REFERENCES comind.cm_research_refs(ref_id);
  END IF;

  IF to_regclass('comind_pm.pm_research_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'cm_research_refs_research_session_fk'
         AND conrelid = 'comind.cm_research_refs'::regclass
     ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_research_session_fk
      FOREIGN KEY (research_session_id)
      REFERENCES comind_pm.pm_research_sessions(id);
  END IF;

  IF to_regclass('comind_pm.pm_links') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'cm_research_refs_source_link_fk'
         AND conrelid = 'comind.cm_research_refs'::regclass
     ) THEN
    ALTER TABLE comind.cm_research_refs
      ADD CONSTRAINT cm_research_refs_source_link_fk
      FOREIGN KEY (source_link_id)
      REFERENCES comind_pm.pm_links(id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cm_research_refs_drive_file_uidx
  ON comind.cm_research_refs(drive_file_id)
  WHERE drive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_research_refs_document_identifier_idx
  ON comind.cm_research_refs(document_identifier)
  WHERE document_identifier IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_research_refs_lifecycle_idx
  ON comind.cm_research_refs(lifecycle_status, publisher, document_identifier);

CREATE INDEX IF NOT EXISTS cm_research_refs_content_sha256_idx
  ON comind.cm_research_refs(content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_research_refs_observed_fingerprint_idx
  ON comind.cm_research_refs(fingerprint_algorithm, observed_fingerprint)
  WHERE observed_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS cm_research_refs_research_session_idx
  ON comind.cm_research_refs(research_session_id)
  WHERE research_session_id IS NOT NULL;

COMMENT ON TABLE comind.cm_research_refs IS
  'Canonical governed research-library references. Drive files are evidence locations, not independent sources of truth. Lifecycle and supersession preserve history instead of deleting it.';

COMMENT ON COLUMN comind.cm_research_refs.url IS
  'Canonical public or authoritative source URL when known. Drive storage is recorded separately.';
COMMENT ON COLUMN comind.cm_research_refs.authority_level IS
  'Source authority classification. Secondary implementation guidance must not be represented as an official standard.';
COMMENT ON COLUMN comind.cm_research_refs.lifecycle_status IS
  'Governed currentness lifecycle. Superseded, withdrawn, retired, historical, and rejected rows remain durable.';
COMMENT ON COLUMN comind.cm_research_refs.content_sha256 IS
  'SHA-256 of original file bytes only. Leave null unless raw bytes were actually hashed.';
COMMENT ON COLUMN comind.cm_research_refs.observed_fingerprint IS
  'A weaker or differently scoped fingerprint, paired with fingerprint_algorithm. It must not be represented as raw-file SHA-256.';
COMMENT ON COLUMN comind.cm_research_refs.superseded_by_ref_id IS
  'Replacement research record when this record has been superseded.';
COMMENT ON COLUMN comind.cm_research_refs.research_session_id IS
  'Optional lineage to the governed research-capture session that established or reverified this record.';
COMMENT ON COLUMN comind.cm_research_refs.source_link_id IS
  'Optional lineage to the write-through pm_links source record created by the Research Capture Control.';

REVOKE ALL ON TABLE comind.cm_research_refs FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS comind.cm_learning_path (
  path_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  objective text NOT NULL,
  audience text,
  status text NOT NULL DEFAULT 'draft',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_learning_path_status_ck
    CHECK (status IN ('draft','active','retired'))
);

COMMENT ON TABLE comind.cm_learning_path IS
  'Governed learning paths assembled from canonical Research Library records. Paths never duplicate source documents.';

CREATE TABLE IF NOT EXISTS comind.cm_learning_path_item (
  path_id uuid NOT NULL
    REFERENCES comind.cm_learning_path(path_id),
  ref_id uuid NOT NULL
    REFERENCES comind.cm_research_refs(ref_id),
  sequence_no integer NOT NULL,
  section_title text,
  rationale text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  learning_objectives text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (path_id, ref_id),
  CONSTRAINT cm_learning_path_item_sequence_ck CHECK (sequence_no > 0),
  CONSTRAINT cm_learning_path_item_sequence_uq UNIQUE (path_id, sequence_no)
);

COMMENT ON TABLE comind.cm_learning_path_item IS
  'Ordered references from a learning path to canonical Research Library records, with educational rationale and objectives.';

CREATE OR REPLACE FUNCTION comind.set_updated_at_learning_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_learning_path_updated ON comind.cm_learning_path;
CREATE TRIGGER trg_cm_learning_path_updated
BEFORE UPDATE ON comind.cm_learning_path
FOR EACH ROW
EXECUTE FUNCTION comind.set_updated_at_learning_path();

REVOKE ALL ON TABLE comind.cm_learning_path FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_learning_path_item FROM PUBLIC, anon, authenticated;

UPDATE comind.cm_research_refs
SET metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object(
                    'rlib_001_legacy_baseline', true,
                    'rlib_001_classified_at', now()
                  )
WHERE metadata->>'rlib_001_legacy_baseline' IS DISTINCT FROM 'true';

UPDATE comind.cm_research_refs
SET lifecycle_status = 'retired',
    metadata = metadata || jsonb_build_object(
      'retirement_reason', 'provider retired from current CoMind architecture',
      'retired_by', 'RLIB-001'
    )
WHERE url LIKE 'https://neon.tech/%'
  AND lifecycle_status <> 'retired';

COMMIT;
