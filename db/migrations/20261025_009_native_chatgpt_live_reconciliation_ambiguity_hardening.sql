-- CFR-001F ambiguity hardening.
-- An archive observation can be intrinsically ambiguous, for example when no
-- active branch can be selected without flattening source topology. Such a
-- receipt must be allowed to fail closed without inventing a match method.
BEGIN;

ALTER TABLE comind.cm_conversation_reconciliation_receipt
  DROP CONSTRAINT IF EXISTS cm_conversation_reconciliation_method_consistency;

ALTER TABLE comind.cm_conversation_reconciliation_receipt
  ADD CONSTRAINT cm_conversation_reconciliation_method_consistency CHECK (
    (result IN ('unmatched_archive', 'ambiguous_match') AND match_method IN ('none', 'weak_correlation'))
    OR
    (result IN ('exact_match', 'compatible_extension', 'conflicting_observation') AND match_method <> 'none')
  );

COMMIT;
