-- CHIST-001: allow non-degrading parser telemetry for schema drift.
-- INFO observations preserve evidence about new OpenAI fields without converting
-- an otherwise sound import into WARN or FAIL.
BEGIN;

ALTER TABLE comind.cm_archive_parser_event
  DROP CONSTRAINT IF EXISTS cm_archive_parser_event_severity_check;

ALTER TABLE comind.cm_archive_parser_event
  ADD CONSTRAINT cm_archive_parser_event_severity_check
  CHECK (severity IN ('INFO', 'WARNING', 'ERROR'));

COMMIT;
