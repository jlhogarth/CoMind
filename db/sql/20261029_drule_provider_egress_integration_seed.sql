BEGIN;

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key = 'COMIND'
), cls AS (
  SELECT id FROM comind_pm.pm_data_classification_levels
  WHERE project_id = (SELECT id FROM p) AND classification_key = 'INTERNAL'
), res AS (
  SELECT id FROM comind_pm.pm_residency_profiles
  WHERE project_id = (SELECT id FROM p) AND profile_key = 'COMIND-TEST-US'
), ret AS (
  SELECT id FROM comind_pm.pm_retention_profiles
  WHERE project_id = (SELECT id FROM p) AND profile_key = 'OPERATIONAL'
)
INSERT INTO comind_pm.pm_data_asset_governance(
  project_id,
  asset_key,
  asset_type,
  classification_id,
  residency_profile_id,
  retention_profile_id,
  tenant_key,
  project_scope_key,
  allowed_purposes,
  metadata
)
SELECT
  p.id,
  'PROVIDER-EXECUTION-TEST-INTERNAL',
  'provider_execution_fixture',
  cls.id,
  res.id,
  ret.id,
  'comind-test',
  'COMIND',
  ARRAY['provider-execution-test'],
  '{"environment":"test","synthetic":true,"scope":"provider broker integration proof only","production_authority":false}'::jsonb
FROM p CROSS JOIN cls CROSS JOIN res CROSS JOIN ret
ON CONFLICT(project_id, asset_key) DO UPDATE SET
  asset_type = excluded.asset_type,
  classification_id = excluded.classification_id,
  residency_profile_id = excluded.residency_profile_id,
  retention_profile_id = excluded.retention_profile_id,
  tenant_key = excluded.tenant_key,
  project_scope_key = excluded.project_scope_key,
  allowed_purposes = excluded.allowed_purposes,
  metadata = excluded.metadata,
  updated_at = now();

WITH p AS (
  SELECT id FROM comind_pm.pm_projects WHERE project_key = 'COMIND'
)
INSERT INTO comind_pm.pm_egress_destinations(
  project_id,
  destination_key,
  destination_type,
  host_pattern,
  max_classification_rank,
  allowed_regions,
  requires_purpose,
  requires_human_review,
  metadata
)
SELECT
  p.id,
  'OPENAI-API',
  'provider',
  'api.openai.com',
  10,
  ARRAY['provider-managed'],
  true,
  true,
  '{"environment":"test","scope":"api.openai.com only","paid_access":"separate explicit approval required","production_authority":false}'::jsonb
FROM p
ON CONFLICT(project_id, destination_key) DO UPDATE SET
  destination_type = excluded.destination_type,
  host_pattern = excluded.host_pattern,
  max_classification_rank = excluded.max_classification_rank,
  allowed_regions = excluded.allowed_regions,
  requires_purpose = excluded.requires_purpose,
  requires_human_review = excluded.requires_human_review,
  metadata = excluded.metadata,
  updated_at = now();

COMMIT;
