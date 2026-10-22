-- Issue #161: one bounded Test-only Foundry Agent handoff.
-- Synthetic data only. This seed is intentionally one-shot and does not reset a terminal lease.

BEGIN;

INSERT INTO comind.cm_org (org_id, name, slug)
VALUES (
  '16100000-0000-4000-8000-000000000001'::uuid,
  'CoMind Foundry Test 161',
  'comind-foundry-test-161'
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_actor (
  actor_id, org_id, kind, handle, display_name, meta
)
VALUES (
  '16100000-0000-4000-8000-000000000002'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  'person',
  'issue161-approver',
  'Issue 161 Test Approver',
  '{"synthetic":true,"issue":161,"role":"test_approver"}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_project (
  project_id, org_id, title, slug, description, status, priority, meta, created_by
)
VALUES (
  '16100000-0000-4000-8000-000000000003'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  'Foundry Bounded Agent Test 161',
  'foundry-bounded-agent-test-161',
  'Synthetic Test-only project proving one model-backed Foundry worker execution.',
  'active',
  1,
  '{"synthetic":true,"issue":161,"environment":"isolated"}'::jsonb,
  '16100000-0000-4000-8000-000000000002'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_actor (
  actor_id, org_id, kind, handle, display_name, meta
)
VALUES (
  '16100000-0000-4000-8000-000000000005'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  'agent',
  'proof-test-161',
  'PROOF Test Agent 161',
  '{"synthetic":true,"issue":161,"role":"proof"}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_agent (
  agent_id, org_id, name, description, config
)
VALUES (
  '16100000-0000-4000-8000-000000000004'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  'PROOF Test Agent 161',
  'One-shot synthetic verifier for Issue #161.',
  '{"synthetic":true,"issue":161,"provider":"ollama","model":"qwen2.5:0.5b"}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_agent_profile (
  profile_id, agent_id, actor_id, org_id, role_code, display_name,
  authority_floor, authority_ceiling, instruction_version,
  runtime_defaults, competencies, status, activated_at
)
VALUES (
  '16100000-0000-4000-8000-000000000006'::uuid,
  '16100000-0000-4000-8000-000000000004'::uuid,
  '16100000-0000-4000-8000-000000000005'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  'proof_test_agent',
  'PROOF Test Agent 161',
  'C0',
  'C1',
  'issue161-proof-v1',
  '{"provider":"ollama","model":"qwen2.5:0.5b","temperature":0,"max_output_chars":1800}'::jsonb,
  '["bounded_verification","evidence_comparison","structured_output"]'::jsonb,
  'active',
  now()
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_capability (
  capability_id, capability_code, description, action, target_kind,
  max_authority, risk_class, cost_bearing, adapter
)
VALUES (
  '16100000-0000-4000-8000-000000000007'::uuid,
  'foundry.test.proof.verify',
  'Verify one synthetic ATLAS handoff using a bounded local model.',
  'verify_handoff',
  'repository',
  'C1',
  'low',
  false,
  'ollama_local'
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_capability_grant (
  grant_id, profile_id, capability_id, org_id, project_id,
  environment, authority_ceiling, scope, granted_by_actor_id, grant_reason
)
VALUES (
  '16100000-0000-4000-8000-000000000008'::uuid,
  '16100000-0000-4000-8000-000000000006'::uuid,
  '16100000-0000-4000-8000-000000000007'::uuid,
  '16100000-0000-4000-8000-000000000001'::uuid,
  '16100000-0000-4000-8000-000000000003'::uuid,
  'isolated',
  'C1',
  '{"target_refs":["jlhogarth/CoMind"],"synthetic_only":true,"max_tasks":1}'::jsonb,
  '16100000-0000-4000-8000-000000000002'::uuid,
  'Issue #161 explicit bounded Test-only execution grant.'
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_task (
  task_id, project_id, title, description, status, priority
)
VALUES (
  '16100000-0000-4000-8000-000000000009'::uuid,
  '16100000-0000-4000-8000-000000000003'::uuid,
  'Verify synthetic ATLAS to PROOF handoff',
  'ATLAS synthetic proposal: Railway is a required dependency for this bounded Foundry Test execution. Evidence supplied to PROOF: (1) the worker executes on a GitHub-hosted Actions runner, (2) the inference provider is local Ollama on that runner, and (3) durable execution state is recorded in the CoMind Test Supabase project. PROOF must decide whether the ATLAS proposal is supported by only this supplied evidence.',
  'in_progress',
  1
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_authorization_request (
  authorization_request_id, requesting_profile_id, requesting_actor_id,
  capability_id, project_id, task_id, authority_level, environment,
  target_kind, target_ref, reason, evidence_refs, status
)
VALUES (
  '16100000-0000-4000-8000-00000000000a'::uuid,
  '16100000-0000-4000-8000-000000000006'::uuid,
  '16100000-0000-4000-8000-000000000005'::uuid,
  '16100000-0000-4000-8000-000000000007'::uuid,
  '16100000-0000-4000-8000-000000000003'::uuid,
  '16100000-0000-4000-8000-000000000009'::uuid,
  'C1',
  'isolated',
  'repository',
  'jlhogarth/CoMind',
  'Issue #161 one-shot synthetic handoff verification.',
  '["github:issue:161","github:issue:114"]'::jsonb,
  'approved'
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_authorization_decision (
  authorization_decision_id, authorization_request_id, decision,
  decided_by_actor_id, decision_basis, policy_refs
)
VALUES (
  '16100000-0000-4000-8000-00000000000b'::uuid,
  '16100000-0000-4000-8000-00000000000a'::uuid,
  'approved',
  '16100000-0000-4000-8000-000000000002'::uuid,
  'Joseph authorized completion of Issue #161 in Test. Execution is synthetic, local-model, one-shot, C1, and non-production.',
  '["issue:161","governance:test-only","authority:C1"]'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO comind.cm_foundry_work_lease (
  task_id, state, not_before, attempt_count, max_attempts, fencing_epoch
)
VALUES (
  '16100000-0000-4000-8000-000000000009'::uuid,
  'ready',
  now(),
  0,
  1,
  0
)
ON CONFLICT (task_id) DO NOTHING;

COMMIT;
