BEGIN;
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_relationship_case_subject
  ON comind.cm_epistemic_relationship (case_id, subject_object_id);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_relationship_case_object
  ON comind.cm_epistemic_relationship (case_id, object_object_id);
DROP INDEX IF EXISTS comind.idx_cm_epistemic_relationship_subject;
DROP INDEX IF EXISTS comind.idx_cm_epistemic_relationship_object;
COMMIT;
