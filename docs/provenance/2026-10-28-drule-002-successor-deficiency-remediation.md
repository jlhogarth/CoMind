# DRULE-002 Successor Deficiency Remediation

Date: 2026-10-28
Status: Test implementation complete; exact-head acceptance required before durable verified-state promotion
Issue: #185
Environment: CoMind Supabase Test `sbgfuanxiqepcoboxzcl`, `us-east-1`

## Starting disposition

The accepted successor-coverage analysis for historical Layer-0 Sections 1 through 28 identified:

- 16 families with modern coverage adequate;
- 9 families with modern coverage partial: Sections 4, 6, 7, 10, 11, 15, 19, 24, and 27;
- 3 families with a genuine current governance gap: Sections 3, 13, and 17.

The original 2025 clause text for Sections 1 through 28 remains unrecovered. This remediation does not invent it and does not change that archaeology fact.

## Remediation objective

Install one reusable RuleBook Control Plane that closes the shared platform capability deficiency for all twelve PARTIAL/GAP families without creating twelve disconnected policy implementations. The control plane must provide durable state, deterministic runtime preflight, evidence and exceptions, Test automation, safe operator visibility, exact-head verification, and a documented integration contract for product lanes.

## Implemented capabilities

### Section 3: Data Classification & Tagging

Installed a five-level CoMind handling taxonomy: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, and `SECRET`. Classification carries default transfer, payload-logging, encryption, and purpose requirements. Governed assets reference the classification registry.

### Section 4: Secrets, Keys & Cryptography

Installed a metadata-only key registry with indirect URI-style secret references, lifecycle states, rotation deadlines, compromise/revocation/retirement handling, and fail-closed key-use preflight. Secret material is not stored in the registry.

### Section 6: Memory Retrieval

Installed a reusable retrieval-authorization preflight that requires sufficient clearance and enforces tenant, project, purpose, and deleted-asset boundaries. Product-specific readers must adopt the common gate rather than clone policy logic.

### Section 7: Episodic Edit & Selective Forget

Installed retention profiles, legal/evidence hold precedence, explicit disposition authority, and a hard-delete boundary. The shared control distinguishes correction, archival/soft disposition, and destructive deletion authority.

### Section 10: Compliance Applicability

Installed a versioned applicability register separating framework, edition/version, jurisdiction, product scope, applicability, satisfaction/evidence state, owner, and review date. Initial controlled entries cover ISO/IEC 42001:2023, ISO/IEC 23894:2023, NIST AI RMF 1.0, the EU AI Act, HIPAA applicability, and SOC 2 assurance scope. No certification, attestation, or universal legal-applicability claim is made.

### Section 11: Prompt Injection & Exfiltration

Installed a structured trust-boundary preflight for untrusted secret requests, authority escalation, and consequential side effects. Governance evidence rejects raw prompt, token, credential, authorization, key-material, password, and secret fields recursively.

### Section 13: Network & Egress Control

Installed an explicit destination registry and deny-by-default egress gate covering destination registration, classification ceiling, region, tenant scope, purpose, and destination-specific human review.

### Section 15: Break-Glass & Overrides

Installed governed exception records with required reason, authority basis, approver, approval time, scope, expiry, revocation/closure state, evidence, and post-event review date. Runtime use must match scope and time bounds. Expired approvals are automatically expired by health refresh.

### Section 17: Multi-Tenancy & Isolation

Installed explicit source/target tenant and project context, same-scope enforcement, deny-by-default cross-scope behavior, and scoped exception support. An edge-case probe found that the first evaluator treated two missing tenant values as equal; the public preflight wrapper was corrected to require all four scope identifiers and now returns `TENANCY_CONTEXT_REQUIRED` when context is absent.

### Section 19: Export, Portability & Data Residency

Installed asset residency profiles with allowed regions/countries, cross-jurisdiction mode, and transfer-basis requirements. The Test profile records `us-east-1`/US only as an environment fact, not a legal residency conclusion.

### Section 24: Fairness, Bias & Sensitive Use

Installed a high-consequence-use gate requiring a scoped passing impact assessment plus explicit human oversight. Assessment evidence records scope and limitations and does not claim universal fairness.

### Section 27: Research, Logging & Privacy

Installed classification-aware logging minimization and retention prerequisites. `CONFIDENTIAL` defaults to metadata-only logging; `RESTRICTED` and `SECRET` deny payload logging by default. Durable logging requires retention semantics.

## Runtime interface

The Fastify server now provides `POST /api/governance/preflight`. It accepts structured metadata only and invokes the private `comind_pm.governance_preflight(...)` database gate. It returns `allow`, `deny`, or `review` plus a stable reason code. Missing database decisions return service unavailable rather than an invented allow.

The database preflight functions use fixed empty search paths. Browser roles and PUBLIC cannot execute them directly.

## Test management surface

The existing Operator Console is extended rather than duplicated. `/rulebook` reads the Test-only `public.v_rulebook_control_hud_test` projection and provides:

- control health and original PARTIAL/GAP classification;
- requirement verification counts;
- operational counts;
- open-exception count;
- health/search/original-disposition filters;
- 30-second browser refresh;
- status-only JSON export.

The browser projection excludes runtime context, exception reasons, tenant IDs, evidence payloads, secret references, and raw model content. It uses a `security_invoker` view and a synthetic/status mirror with RLS. `anon` has SELECT only; authenticated and write privileges are not granted.

## Automation

Supabase Test has one scheduled job:

- job: `comind-rulebook-control-health`
- cadence: every 15 minutes
- command: `select comind_pm.refresh_rulebook_control_hud();`

The job expires elapsed emergency approvals, recalculates health, and refreshes the status-only HUD mirror. It makes no network request and no paid provider call.

## Deterministic runtime verification

A live Test matrix exercised positive and negative/review paths for all twelve families. The first 24 cases all passed. An additional missing-tenancy-context case was added after the edge probe and now denies as required.

Verified examples include:

- unknown classification denied;
- revoked key denied;
- insufficient retrieval clearance denied;
- disallowed hard deletion denied;
- unsupported external compliance claim denied;
- untrusted secret request denied;
- unknown egress destination denied;
- break-glass scope mismatch denied;
- cross-tenant request denied;
- missing tenant/project scope denied;
- wrong residency region denied;
- high-consequence use without passing assessment returns review;
- restricted payload logging denied;
- nested raw prompt context is rejected before decision evidence can be written.

All durable synthetic verification fixtures were removed after testing. Current durable Test state has zero synthetic governed assets, keys, obligations, assessments, and emergency exceptions, and zero open governance exceptions.

## Database hardening review

The new control plane contains 13 private `comind_pm` tables. Post-hardening readback shows:

- 13/13 with RLS enabled;
- 13/13 with explicit restrictive `private_deny_all` policy;
- all browser/public table privileges revoked;
- 20 foreign keys total;
- 0 unindexed foreign keys after four targeted covering indexes were added;
- no new successor-control function appears in the Supabase mutable-search-path warning;
- no new successor-control table remains in the Supabase RLS-without-policy finding.

The security and performance advisors still report older repository-wide findings outside the scope of this lane. Those were not silently altered.

## Repository verification

The dedicated exact-head workflow `DRULE-002 Successor Control Plane` contains two jobs:

1. PostgreSQL 17 builds the core control plane twice for idempotency, applies hardening and seed data, and runs fail-closed structural/runtime verification.
2. Node 24 builds/tests the Fastify governance API and typechecks/tests the Operator Console RuleBook HUD.

The acceptance SQL is intentionally separate from construction. After exact-head CI succeeds, it promotes the 36 atomic requirements to `verified`, records scoped passing assessments, refreshes health, records a new `successor_remediation_2026_10_28` disposition in the archaeology queue, and resolves the three current-governance gap cases only at the `shared_platform_control_capability_verified_test` scope.

## What acceptance means

A successful acceptance means the previously PARTIAL/GAP families now have a reusable modern control capability that is implemented and verified in CoMind Test. It does not mean:

- the missing 2025 text was recovered;
- archaeology for Sections 1 through 28 is complete;
- every product/runtime path has adopted the control;
- production has been activated;
- any certification, attestation, regulatory compliance, or legal applicability has been established;
- a production multi-tenant deployment is authorized.

Each owning product/runtime lane must integrate the common preflight at its consequential chokepoints and produce end-to-end operating evidence before an operational or production-enforced claim is made.

## Production boundary

No production schema, RLS, grants, runtime activation, paid-provider call, or production deployment is authorized or performed by this checkpoint. The Test control plane is deliberately reusable so production hardening can later be proposed from evidence rather than reconstructed.
