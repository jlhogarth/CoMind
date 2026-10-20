-- Exercise a changing latest-activity projection across cursor-page requests.
-- This proof runs inside the disposable PostgreSQL 17 CI database only.
-- The appended observation is rolled back at the end of this transaction.

BEGIN;

CREATE TEMP TABLE hud_page_1 ON COMMIT DROP AS
SELECT activity_id, activity_key, has_terminal_source_evidence, last_observed_at,
       started_at, hud_state
FROM public.v_activity_hud_test
ORDER BY has_terminal_source_evidence ASC NULLS FIRST,
         last_observed_at ASC NULLS FIRST,
         started_at ASC,
         activity_key ASC
LIMIT 2;

DO $first_page$
BEGIN
  IF (SELECT count(*) FROM hud_page_1) <> 2 THEN
    RAISE EXCEPTION 'Expected a bounded first page of two synthetic activities';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hud_page_1
    WHERE activity_key = 'synthetic-stale'
      AND hud_state = 'stale_unknown'
  ) THEN
    RAISE EXCEPTION 'Expected the stale synthetic activity on the first cursor page';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM hud_page_1
    WHERE activity_key = 'synthetic-stale'
      AND has_terminal_source_evidence IS FALSE
  ) THEN
    RAISE EXCEPTION 'The first page must preserve the unresolved activity state';
  END IF;
END;
$first_page$;

-- Append a synthetic heartbeat after page one has been read. The projection
-- exposes the activity's latest observation, so its sort position changes.
INSERT INTO comind_hud_test.activity_observations
  (activity_id, event_type, source_status, source_event_ref, source_occurred_at,
   observed_at, summary, evidence)
SELECT activity_id, 'heartbeat', 'running', 'synthetic-event-page-append',
       now(), now(), 'Synthetic heartbeat appended between cursor-page requests.',
       '[{"type":"fixture","id":"page-append"}]'::jsonb
FROM comind_hud_test.activity_runs
WHERE activity_key = 'synthetic-stale'
  AND NOT EXISTS (
    SELECT 1
    FROM comind_hud_test.activity_observations
    WHERE source_event_ref = 'synthetic-event-page-append'
  );

CREATE TEMP TABLE hud_page_2 ON COMMIT DROP AS
WITH cursor_row AS (
  SELECT has_terminal_source_evidence, last_observed_at, started_at, activity_key
  FROM hud_page_1
  ORDER BY has_terminal_source_evidence DESC NULLS LAST,
           last_observed_at DESC NULLS LAST,
           started_at DESC,
           activity_key DESC
  LIMIT 1
)
SELECT v.activity_id, v.activity_key, v.has_terminal_source_evidence,
       v.last_observed_at, v.started_at, v.hud_state
FROM public.v_activity_hud_test v
CROSS JOIN cursor_row c
WHERE (v.has_terminal_source_evidence, v.last_observed_at, v.started_at, v.activity_key)
    > (c.has_terminal_source_evidence, c.last_observed_at, c.started_at, c.activity_key)
ORDER BY v.has_terminal_source_evidence ASC NULLS FIRST,
         v.last_observed_at ASC NULLS FIRST,
         v.started_at ASC,
         v.activity_key ASC
LIMIT 2;

DO $second_page$
DECLARE
  v_page_two_count integer;
  v_repeated_newer integer;
  v_coverage_limit text;
BEGIN
  SELECT count(*) INTO v_page_two_count FROM hud_page_2;
  IF v_page_two_count <> 2 THEN
    RAISE EXCEPTION 'Expected a bounded second page of two rows, got %', v_page_two_count;
  END IF;

  SELECT count(*) INTO v_repeated_newer
  FROM hud_page_1 first_page
  JOIN hud_page_2 second_page USING (activity_id, activity_key)
  WHERE second_page.last_observed_at > first_page.last_observed_at
    AND second_page.hud_state = 'running';

  IF v_repeated_newer <> 1 THEN
    RAISE EXCEPTION 'Expected the appended activity to reappear with newer state on the next page, got %', v_repeated_newer;
  END IF;

  SELECT coverage_limit INTO v_coverage_limit
  FROM public.v_activity_hud_test
  WHERE activity_key = 'synthetic-stale';

  IF v_coverage_limit NOT LIKE '%no complete-history, lossless-feed, or snapshot-consistency claim%' THEN
    RAISE EXCEPTION 'The changed-view result lost its explicit coverage limitation';
  END IF;
END;
$second_page$;

SELECT first_page.activity_key AS page_one_activity,
       first_page.last_observed_at AS page_one_observed_at,
       second_page.activity_key AS page_two_activity,
       second_page.last_observed_at AS page_two_observed_at,
       second_page.hud_state AS page_two_state,
       second_page.activity_id = first_page.activity_id AS activity_repeated_after_append,
       coverage_limit
FROM hud_page_1 first_page
JOIN hud_page_2 second_page USING (activity_id, activity_key)
JOIN public.v_activity_hud_test v USING (activity_key)
WHERE second_page.last_observed_at > first_page.last_observed_at;

ROLLBACK;
