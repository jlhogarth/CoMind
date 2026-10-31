-- CHIST-K01: least-privilege pgvector type visibility for governed retrieval roles.
-- Schema USAGE permits resolving extensions.vector at function boundaries; it
-- does not grant table access, function execution, mutation, or ownership.
BEGIN;

DO $chist_k01_vector_visibility$
BEGIN
  IF to_regnamespace('extensions') IS NULL THEN
    RAISE EXCEPTION 'CHIST-K01 requires the extensions schema';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_deriver') THEN
    RAISE EXCEPTION 'CHIST-K01 requires comind_conversation_history_deriver';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_reader') THEN
    RAISE EXCEPTION 'CHIST-K01 requires comind_conversation_history_reader';
  END IF;
END
$chist_k01_vector_visibility$;

GRANT USAGE ON SCHEMA extensions
  TO comind_conversation_history_deriver, comind_conversation_history_reader;

COMMIT;
