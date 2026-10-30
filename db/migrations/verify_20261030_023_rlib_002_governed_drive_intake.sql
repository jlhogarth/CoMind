BEGIN;

DO $$
DECLARE
  v_browser_grants integer;
  v_source_id uuid;
BEGIN
  IF to_regclass('comind.cm_research_intake_source') IS NULL THEN
    RAISE EXCEPTION 'RLIB-002 missing cm_research_intake_source';
  END IF;
  IF to_regclass('comind.cm_research_intake') IS NULL THEN
    RAISE EXCEPTION 'RLIB-002 missing cm_research_intake';
  END IF;
  IF to_regclass('comind.cm_research_intake_event') IS NULL THEN
    RAISE EXCEPTION 'RLIB-002 missing cm_research_intake_event';
  END IF;

  SELECT source_id INTO v_source_id
  FROM comind.cm_research_intake_source
  WHERE source_key='saved-from-chrome'
    AND drive_folder_id='18I-qJ-MW40PybsxIkMbVo_hibh-3LgxG'
    AND default_destination_folder_id='1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz'
    AND environment='Test'
    AND production=false
    AND enabled=true
    AND automation_allowed=true;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'RLIB-002 canonical Saved from Chrome source configuration missing or unsafe';
  END IF;

  SELECT count(*) INTO v_browser_grants
  FROM information_schema.role_table_grants
  WHERE table_schema='comind'
    AND table_name IN ('cm_research_intake_source','cm_research_intake','cm_research_intake_event')
    AND grantee IN ('PUBLIC','anon','authenticated');

  IF v_browser_grants <> 0 THEN
    RAISE EXCEPTION 'RLIB-002 unexpected browser/public table grants: %', v_browser_grants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='comind.cm_research_intake_event'::regclass
      AND tgname='trg_cm_research_intake_event_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'RLIB-002 append-only event mutation guard missing';
  END IF;
END
$$;

DO $$
DECLARE
  v_ref_id uuid;
  v_intake_id uuid;
  v_duplicate uuid;
  v_status text;
  v_events integer;
BEGIN
  INSERT INTO comind.cm_research_refs(
    title,url,source_kind,authority_level,lifecycle_status,content_sha256,fingerprint_algorithm
  ) VALUES (
    'RLIB-002 verifier canonical source',
    'https://comindinc.com/internal/verification/rlib-002-canonical',
    'documentation','internal_canonical','current',
    repeat('a',64),'sha256:raw-bytes'
  ) RETURNING ref_id INTO v_ref_id;

  v_intake_id := comind.register_research_intake_detection(
    'saved-from-chrome',
    'rlib-002-verifier-drive-file',
    'https://drive.google.com/file/d/rlib-002-verifier-drive-file/view',
    'RLIB-002-verifier.pdf',
    'application/pdf',
    1024,
    now(),
    now(),
    'RLIB-002 verifier'
  );

  SELECT r.status,r.duplicate_of_ref_id
    INTO v_status,v_duplicate
  FROM comind.record_research_intake_fingerprint(
    v_intake_id, repeat('a',64), 'RLIB-002 verifier'
  ) r;

  IF v_status <> 'exact_duplicate' OR v_duplicate <> v_ref_id THEN
    RAISE EXCEPTION 'RLIB-002 exact duplicate control failed: status %, duplicate %', v_status, v_duplicate;
  END IF;

  SELECT count(*) INTO v_events
  FROM comind.cm_research_intake_event
  WHERE intake_id=v_intake_id
    AND event_type IN ('detected','fingerprint_verified','exact_duplicate_found');

  IF v_events <> 3 THEN
    RAISE EXCEPTION 'RLIB-002 expected 3 core duplicate evidence events, found %', v_events;
  END IF;

  BEGIN
    PERFORM comind.propose_research_intake_classification(
      v_intake_id,
      'documentation','internal_canonical','current',
      ARRAY['verification'],ARRAY['RLIB'],
      '1zswjOidkaPwh0qFoiSE29HQk-a2KvLhz',1.0,
      jsonb_build_object('basis','verifier'),
      'no_match',NULL,'RLIB-002 verifier'
    );
    RAISE EXCEPTION 'RLIB-002 allowed exact duplicate to be promoted as a new canonical item';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'exact duplicate cannot be promoted%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE comind.cm_research_intake_event
    SET detail=jsonb_build_object('tampered',true)
    WHERE intake_id=v_intake_id;
    RAISE EXCEPTION 'RLIB-002 allowed mutation of append-only intake evidence';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'cm_research_intake_event is append-only' THEN
        RAISE;
      END IF;
  END;
END
$$;

DO $$
DECLARE
  v_intake_id uuid;
BEGIN
  v_intake_id := comind.register_research_intake_detection(
    'saved-from-chrome',
    'rlib-002-verifier-invalid-hash',
    'https://drive.google.com/file/d/rlib-002-verifier-invalid-hash/view',
    'RLIB-002-invalid-hash.pdf',
    'application/pdf',
    1,
    now(),now(),'RLIB-002 verifier'
  );

  BEGIN
    PERFORM * FROM comind.record_research_intake_fingerprint(
      v_intake_id,'not-a-raw-sha256','RLIB-002 verifier'
    );
    RAISE EXCEPTION 'RLIB-002 accepted an invalid raw SHA-256';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'raw SHA-256 must be 64 lowercase%' THEN
        RAISE;
      END IF;
  END;
END
$$;

ROLLBACK;
