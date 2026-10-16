# Live Foundry Stage 1 Acceptance and LF-1B Hardening Provenance

Date: 2026-10-16 UTC
Issue: #129
Repository baseline at issue creation: `bab9c6f162adf1300f6e28d0afc1afb6ac62a681`
Live Supabase project: `sbgfuanxiqepcoboxzcl`

## Evidence-state statement

The Live Foundry evidence state after LF-1 is:

| State | Status | Evidence meaning |
| --- | --- | --- |
| Documented | Yes | Stage 1 architecture, migration ordering, controls, and acceptance boundaries are recorded. |
| Repository implemented | Yes | The reviewed Stage 1 migration package and verification contracts exist in the repository. |
| Isolated verified | Yes | The Stage 1 package passed production-shaped isolated PostgreSQL verification. |
| Live deployed substrate | Yes | All six reviewed Stage 1 migrations are recorded in the live Supabase migration ledger. |
| Postdeployment verified | Yes | The exact committed Stage 1 postdeployment contract returned `stage1_contract_pass: true`. |
| Security reconciled | Yes, with known findings | The expected Security Advisor baseline was read back and reconciled. This does not mean zero findings. |
| Agent configured | No | No Foundry Agent identity or profile has been configured live. |
| Agent operating | No | No Foundry Agent is operating live. |
| Successful Agent execution | No | No Agent or PM Agent execution evidence was created by LF-1. |
| Evidence-backed compliance | Not claimed | Technical substrate acceptance is not equivalent to compliance effectiveness. |
| Certification readiness | Not claimed | No certification-readiness claim follows from LF-1. |
| Certified conformity | Not claimed | No certification claim exists. |

## Accepted live migration ledger

The live ledger at LF-1 acceptance contains exactly these twelve reviewed entries:

1. `20261005213616 comind_base_v2_initial_build`
2. `20261006051527 comind_pm_ledger_maintenance_package_v0_1`
3. `20261006051627 comind_pm_ledger_hardening_v0_1_1`
4. `20261015211851 operator_console_live_activation_v0_2`
5. `20261015212201 operator_console_service_role_least_privilege_v0_2_1`
6. `20261015212719 operator_console_explicit_deny_policies_v0_2_2`
7. `20261016031254 live_foundry_stage1_finops_current_runtime_projection_v1`
8. `20261016031412 live_foundry_stage1_paid_provider_budget_authority_hardening_v1`
9. `20261016031511 live_foundry_stage1_current_runtime_budget_authority_adapter_v1`
10. `20261016031947 live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1`
11. `20261016032259 live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1`
12. `20261016032328 live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1`

The machine-readable frozen baseline is `config/live_foundry_lf1_postdeployment_baseline.json`.

The read-only drift contract is `db/verification/live_foundry_lf1_baseline_contract.sql`.

## Protected live state at acceptance

The protected row-count baseline is:

- `comind.cm_org = 1`
- `comind.cm_project = 1`
- `comind.cm_actor = 1`
- `comind.cm_agent = 0`
- `comind.cm_agent_run = 0`
- `comind.cm_agent_step = 0`
- `comind.cm_tool_call = 0`
- `comind.cm_conversation = 0`
- `comind.cm_message = 0`
- `comind.cm_task = 0`
- `comind.cm_milestone = 0`
- `comind.cm_doc = 0`
- `comind.cm_evidence = 0`
- `comind_pm.pm_agent_runs = 0`
- `comind_pm.pm_work_items = 3`
- `comind.cm_budget_authority_binding = 0`
- `comind.cm_budget_authority_reservation = 0`
- `comind.cm_budget_authority_telemetry = 0`

No LF-1 migration populated an Agent or created Agent execution evidence.

## Provider registry

Exactly seven reviewed provider codes were observed:

- `google_gemini`
- `local_rtx5090`
- `openai`
- `railway`
- `replit`
- `supabase`
- `vercel`

LF-1 did not execute a paid provider.

## Security baseline

The accepted Security Advisor state is not zero findings.

Seven WARN findings remain for mutable function search paths:

- `comind.current_actor()`
- `comind.fn_belief_update_beta(uuid,boolean,jsonb)`
- `comind.fn_create_causal_node_from_memory(uuid,text,text)`
- `comind.set_current_actor(uuid)`
- `comind.set_updated_at_checklist()`
- `comind.set_updated_at_research_refs()`
- `comind.set_updated_at()`

Fifteen INFO findings report RLS enabled with no policy. These are the intentional LF-1 fail-closed surfaces captured in the machine-readable baseline.

The absence of client-access policies is intentional for this stage. It is not a claim that the broad Foundry security boundary is complete. Migration `20261008_007_foundry_security_prerequisites.sql` remains a separate LF-3 decision because it sweeps existing `comind` relations and may affect runtime compatibility.

## Operator Console boundary

The live Operator Console authority registry contains exactly four enabled relations:

- `public.comments`
- `public.operator_console_verification_records`
- `public.posts`
- `public.users`

No Stage 1 or Foundry relation is delegated through the Operator Console registry.

Live Foundry must not change that registry as an incidental effect of LF-2.

## LF-1B database connection defect

LF-1 was deployed successfully through the Supabase control path, but the GitHub-hosted PostgreSQL automation path is not yet dependable.

Evidence established before Issue #129:

- the direct Supabase database endpoint is IPv6-only for the current project configuration;
- GitHub-hosted runners require an IPv4-compatible path;
- Supabase Shared Pooler Session mode provides that path on port 5432;
- GitHub can reach the verified pooler endpoint;
- authentication using the credential stored in the old GitHub `DATABASE_URL` failed;
- no database password was exposed;
- no database password was changed or rotated;
- Supabase dashboard OAuth is separate from PostgreSQL database authentication.

The preferred repository contract is now the dedicated secret name `SUPABASE_SESSION_DATABASE_URL`.

The permanent bounded connectivity proof is:

- workflow: `.github/workflows/live-supabase-connectivity-readonly.yml`
- script: `scripts/verify_live_supabase_connectivity_readonly.sh`

The workflow is intentionally manual and read-only. It is not exposed to pull-request code. The script validates the expected Session pooler metadata without printing credentials, requires SSL, forces transaction read-only mode, and verifies the LF-1 migrations as a required subset rather than requiring that the migration ledger remain permanently frozen.

Ordinary repository-health CI no longer treats the existence of a generic `DATABASE_URL` secret as proof of production database readiness.

## Credential boundary still open

Repository implementation cannot prove the new GitHub connectivity path until the dedicated secret contains the current valid pooled PostgreSQL connection string.

Issue #129 does not create, rotate, disclose, or infer the database password.

After the secret is reconciled through an authorized GitHub secret-management surface, the manual `Live Supabase Read-Only Connectivity` workflow must pass before GitHub-hosted live database automation is considered dependable.

## LF-2 readiness boundary

Migration `db/migrations/20261008_006_foundry_agent_substrate.sql` is the only schema migration in LF-2 scope.

LF-2 explicitly excludes migration 007 and later Foundry runtime layers.

The LF-2 manifest is `config/live_foundry_lf2_agent_substrate_manifest.json`.

The LF-2 live read-only preflight is `db/verification/live_foundry_lf2_preflight.sql`.

The LF-2 postdeployment contract is `db/verification/live_foundry_lf2_postdeploy.sql`.

The independent isolated gate is `.github/workflows/live-foundry-lf2-readiness.yml` using `scripts/test_live_foundry_lf2_agent_substrate.sh`.

## Lifecycle authority decision for LF-2

Migration 006 grants `service_role` only `SELECT` and `INSERT` on the twelve new Foundry substrate tables. It does not delegate `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER` authority.

This is retained as the LF-2 least-privilege contract.

The repository contains lifecycle-oriented fields such as profile status, grant revocation, authorization-request status, and deliberation closure. LF-2 does not silently grant runtime mutation authority merely because those fields exist.

Later activation work must explicitly decide how governed suspension, revocation, closure, and other lifecycle transitions are performed and evidenced. That decision belongs before operational Agent activation and may require dedicated functions, append-only transition records, administrative controls, or a separately reviewed authority path.

Migration 008 already demonstrates the preferred append-only pattern for execution completion by adding terminal result and outcome records rather than mutating immutable execution provenance. LF-2 does not pull migration 008 forward.

## Recovery posture

LF-2 follows forward repair by default.

If a future live LF-2 deployment fails or partially commits:

1. freeze further LF-2 mutation;
2. capture the exact live migration ledger and object state;
3. preserve Agent and protected row counts;
4. compare against the LF-1 frozen baseline and LF-2 manifest;
5. diagnose the exact committed delta;
6. prepare a bounded reviewed forward repair when safe;
7. do not drop production objects merely to recreate the predeployment shape without separate destructive authority.

## Canonical evidence rule

Never convert documentation, repository presence, isolated verification, or schema deployment into an Agent-operating claim.

Never substitute plausibility, confidence, verbosity, convenience, or user agreement for epistemic justification.

No Hallucinations. No Lies.
