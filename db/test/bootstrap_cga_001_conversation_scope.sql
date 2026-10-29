CREATE SCHEMA IF NOT EXISTS comind;

CREATE TABLE IF NOT EXISTS comind.cm_org (
  org_id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_project (
  project_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES comind.cm_org(org_id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_conversation (
  conv_id uuid PRIMARY KEY,
  org_id uuid REFERENCES comind.cm_org(org_id),
  project_id uuid REFERENCES comind.cm_project(project_id),
  source text NOT NULL,
  title text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO comind.cm_org(org_id,name,slug)
VALUES ('997bfcdf-e42f-4757-8d1c-d0da44d26482','CoMind, Inc.','comind')
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO comind.cm_project(project_id,org_id,title,slug)
VALUES ('8ac9fab3-35df-48fb-b1df-95285fee9dc0','997bfcdf-e42f-4757-8d1c-d0da44d26482','CoMind','comind')
ON CONFLICT (project_id) DO NOTHING;

INSERT INTO comind.cm_conversation(conv_id,source,title,external_ref,metadata) VALUES
('fba50c55-a8eb-4131-8993-88caa83be70e','cfr_test','CFR-001 synthetic interruption recovery proof','cfr-001:test:interruption:v1','{"issue":176,"synthetic":true}'::jsonb),
('189e5534-4340-465d-8736-8eddfbf9a999','cfr_test','CFR-001 synthetic interruption recovery proof','cfr-001:test:interruption:dynamic','{"issue":176,"synthetic":true}'::jsonb),
('ae66e075-5ed4-4be2-9863-47234b9636e7','cfr_service_role_test','CFR-001 service role capture proof','cfr-001:test:service-role:v1','{"issue":176,"synthetic":true}'::jsonb),
('653252ed-2cae-4e2e-8c56-4633f560ceb0','cfr_service_role_test','CFR-001 service role capture proof','cfr-001:test:service-role:dynamic','{"issue":176,"synthetic":true}'::jsonb),
('1f0a2cd2-dc29-420f-a3f4-45a5b15200a0','live','CFR-001C service-role completed stream proof','cfr-001c-service-proof-completed-20261025','{"proof":"CFR-001C","environment":"Test"}'::jsonb),
('9881599b-6bef-4ee9-baef-b7b8073532eb','live','CFR-001C service-role interrupted stream proof','cfr-001c-service-proof-interrupted-20261025','{"proof":"CFR-001C","environment":"Test"}'::jsonb),
('e1810001-0000-4000-8000-000000000001','live','CFR-001E live Test interrupted prune-contract proof','cfr-001e-live-prune-contract-20261025','{"proof":"CFR-001E","environment":"Test"}'::jsonb),
('f1010001-0000-4000-8000-000000000001','native_chatgpt_live','CFR-001F Test exact','cfr-001f-test-exact','{"synthetic":true,"source_system":"chatgpt"}'::jsonb),
('f1020001-0000-4000-8000-000000000001','native_chatgpt_live','CFR-001F Test interrupted extension','cfr-001f-test-live-partial','{"synthetic":true,"source_system":"chatgpt"}'::jsonb),
('72000000-0000-4000-8000-000000000001','live','CFR-001G live Test persistence proof',NULL,'{"lane":"CFR-001G","proof":"owner_seeded_management_session","synthetic":true}'::jsonb),
('99999999-0000-4000-8000-000000000001','unrelated_test','Unrelated unscoped conversation','unrelated-test','{"synthetic":true}'::jsonb)
ON CONFLICT (conv_id) DO NOTHING;
