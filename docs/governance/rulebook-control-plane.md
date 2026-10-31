# CoMind RuleBook Control Plane

Date: 2026-10-29
Status: Test implementation, verification, and bounded product-path adoption
Owner: CoMind Governance
Scope: successor-control remediation for historical Layer-0 Sections 3, 4, 6, 7, 10, 11, 13, 15, 17, 19, 24, and 27

## Purpose

The RuleBook Control Plane converts the twelve Layer-0 successor-coverage deficiencies identified by DRULE-002 into explicit modern governance capabilities. It does not reconstruct missing 2025 wording. Historical source loss remains separately recorded in the archaeology queue.

The control plane centralizes classification, retrieval authority, retention and deletion, compliance applicability, trust-boundary security, network egress, emergency authority, tenancy isolation, residency, sensitive-use review, privacy-aware logging, cryptographic lifecycle metadata, runtime decisions, exceptions, assessments, automation, and operator visibility.

## Design principles

1. Deny or require review when authority or control context is missing.
2. Keep raw prompts, credentials, tokens, passwords, secret material, and authorization headers out of governance-decision evidence.
3. Keep the authoritative control state in the private `comind_pm` schema.
4. Expose only a status projection to the Test Operator Console.
5. Separate applicability from conformity. A framework can be applicable while certification, attestation, or compliance remains unproven.
6. Separate control capability from product integration. Product lanes must call the common preflight rather than reimplement its policy.
7. Preserve Test and production boundaries. Test activation does not authorize production activation.
8. Preserve historical archaeology independently from current successor adequacy.
9. Treat integration brokers and connected applications as execution substrates. Connection state never creates authority, and credential custody must remain outside RuleBook evidence.

## Control families

| Section | Control | Remediation capability |
| --- | --- | --- |
| 3 | `DRULE-C03` Data Classification & Tagging | Five-level CoMind handling taxonomy with transfer, logging, encryption, and purpose defaults. Governed assets reference a classification. |
| 4 | `DRULE-C04` Secrets, Keys & Cryptography | Metadata-only cryptographic key registry with indirect secret references, lifecycle state, rotation deadlines, compromise/revocation/retirement handling. |
| 6 | `DRULE-C06` Memory Retrieval | Clearance, tenant, project, purpose, and disposition-aware retrieval authorization. |
| 7 | `DRULE-C07` Episodic Edit & Selective Forget | Retention profiles, explicit disposition authority, legal/evidence hold precedence, hard-delete boundary. |
| 10 | `DRULE-C10` Compliance Applicability | Versioned applicability register separating frameworks, law, assurance, product scope, jurisdiction, evidence state, and claim authority. |
| 11 | `DRULE-C11` Prompt Injection & Exfiltration | Structured trust-boundary preflight for untrusted secret requests, authority escalation, consequential side effects, and raw-context rejection. |
| 13 | `DRULE-C13` Network & Egress Control | Explicit destination registry with deny-by-default destination, classification, region, tenant, purpose, and human-review controls. |
| 15 | `DRULE-C15` Break-Glass & Overrides | Time-bounded scoped exceptions with reason, authority basis, approver, expiry, revocation, evidence, and post-event review. |
| 17 | `DRULE-C17` Multi-Tenancy & Isolation | Explicit source/target tenant and project context, same-scope enforcement, deny-by-default cross-scope behavior, scoped exception support. |
| 19 | `DRULE-C19` Export, Portability & Data Residency | Asset residency profiles, allowed regions/countries, cross-jurisdiction mode, transfer-basis requirement. |
| 24 | `DRULE-C24` Fairness, Bias & Sensitive Use | Scoped impact assessment and explicit human oversight gate for high-consequence use, with evidence scope and limitations. |
| 27 | `DRULE-C27` Research, Logging & Privacy | Classification-aware logging minimization, metadata-only defaults, retention prerequisite for durable logging. |

## Data classification

The initial CoMind classification vocabulary is a handling policy, not a statutory taxonomy:

| Key | Rank | External transfer default | Payload logging default | Purpose | Encryption |
| --- | ---: | --- | --- | --- | --- |
| `PUBLIC` | 0 | allow | allow | optional | not required by classification alone |
| `INTERNAL` | 10 | review | metadata only | required | required |
| `CONFIDENTIAL` | 20 | review | metadata only | required | required |
| `RESTRICTED` | 30 | deny | deny | required | required |
| `SECRET` | 40 | deny | deny | required | required |

Higher ranks require at least the handling restrictions of lower ranks. Product-specific legal classifications can be mapped to these handling classes without changing their legal meaning.

## Runtime API

Trusted server-side callers use:

`POST /api/governance/preflight`

Request:

```json
{
  "controlKey": "DRULE-C13",
  "context": {
    "asset_key": "registered-asset-key",
    "destination_key": "registered-destination-key",
    "region": "registered-region",
    "tenant_key": "registered-tenant",
    "purpose": "registered-purpose"
  },
  "record": true
}
```

Response decisions are `allow`, `deny`, or `review` with a stable `reason_code`. The API never converts a missing database decision into `allow`.

The API rejects context keys named `prompt`, `raw_prompt`, `secret`, `password`, `token`, `api_key`, `apikey`, `authorization`, `credential`, `credentials`, or `key_material`, including nested occurrences. Callers must provide structured observations such as `untrusted_input=true` or `asks_for_secrets=true`, not raw content.

## Control-specific preflight contexts

### Classification, `DRULE-C03`

Required: `classification_key`. Purpose is required when the classification says so.

### Cryptographic lifecycle, `DRULE-C04`

Required: `key_key`. The registry stores only metadata and an indirect URI-style secret reference. Revoked, compromised, retired, non-active, or overdue keys cannot pass.

### Retrieval, `DRULE-C06`

Required: `asset_key`, `actor_clearance_key`, `tenant_key`, `project_scope_key`, and when applicable `purpose`.

### Deletion and disposition, `DRULE-C07`

Required: `asset_key`, `action`, `disposition_authorized`. Holds take precedence. Hard deletion must be allowed by the retention profile or separately governed authority.

### Compliance, `DRULE-C10`

Required: `obligation_key`, `action`. External conformity or certification claims fail when an applicable/conditional obligation lacks verified or independently assessed evidence.

### Trust boundary, `DRULE-C11`

Structured booleans: `untrusted_input`, `asks_for_secrets`, `authority_escalation`, `side_effect`, `human_approved`. Raw content does not belong in this context.

### Egress, `DRULE-C13`

Required: `asset_key`, `destination_key`, `region`, `purpose`; tenant is required when the destination is tenant-scoped.

### Break glass, `DRULE-C15`

Required: `exception_key`, `resource`, `action`. Approval without expiry is structurally invalid.

### Tenancy, `DRULE-C17`

Required: `source_tenant`, `target_tenant`, `source_project`, `target_project`, `action`. Missing scope fails closed. Cross-scope operations require an active scoped exception.

### Residency, `DRULE-C19`

Required: `asset_key`, `region`; use `cross_jurisdiction` and `transfer_basis` when transfer crosses a jurisdictional boundary.

### High-consequence use, `DRULE-C24`

Use `high_consequence`, `assessment_key`, and `human_oversight`. A high-consequence request without a passing scoped impact assessment and human oversight returns review.

### Privacy-aware logging, `DRULE-C27`

Required: `asset_key`, `log_mode`, and `durable`. Confidential-or-higher payload logging is denied or reviewed according to classification. Durable logging requires retention semantics.

## Exceptions and emergency authority

Exceptions are first-class governed records. An approved emergency exception requires approver, approval time, expiry, reason, authority basis, and scope. Runtime use must match the recorded resource/action or tenant scope. The scheduled health refresh expires elapsed approvals automatically. An exception does not alter the underlying policy definition and must not become standing privilege.

## Compliance applicability register

The initial register carries current CoMind governance positions for ISO/IEC 42001:2023, ISO/IEC 23894:2023, NIST AI RMF 1.0, the EU AI Act, HIPAA applicability, and SOC 2 assurance scope.

These records deliberately do not claim certification, attestation, or universal legal applicability. HIPAA and SOC 2 remain unassessed until the relevant product/data/contract scope exists. EU AI Act applicability remains conditional on role, market, use case, classification, and effective dates.

## Test automation

Supabase Test runs `comind-rulebook-control-health` every 15 minutes using `pg_cron`. The job executes only `comind_pm.refresh_rulebook_control_hud()`, which:

1. expires elapsed approved exceptions;
2. recalculates requirement and assessment health;
3. updates the private control health record;
4. refreshes a status-only Test HUD mirror.

The job makes no external HTTP call and performs no paid provider action.

## Operator Console HUD

`/rulebook` reads only `public.v_rulebook_control_hud_test` using the existing publishable Test client. The view is `security_invoker`, the mirror table has RLS, and `anon` receives SELECT only. The browser does not receive:

- runtime decision context;
- exception reasons or authority basis;
- tenant identifiers;
- evidence payloads;
- secret references;
- key metadata beyond aggregate control health;
- raw prompts or model content.

The HUD refreshes every 30 seconds, supports health and original-disposition filters, and exports only the visible status projection.

## Governed integration gateway

The CoMind Integration Gateway provides a governed path for external application and developer-tool execution. CIG-001 currently uses Composio for managed GitHub and Supabase connections. The gateway does not replace RuleBook, L4A, provider-native permissions, or platform confirmation requirements.

Before a consequential gateway action, the acting lane must resolve current CoMind authority and evaluate the applicable structured controls. At minimum, external actions should consider:

1. `DRULE-C11` for untrusted input, secret requests, authority escalation, side effects, and required human approval;
2. `DRULE-C17` for tenant and project scope;
3. `DRULE-C13` for governed outbound destination and purpose when external transfer or provider execution occurs;
4. `DRULE-C04` for credential lifecycle metadata without placing raw credentials in governance evidence;
5. `DRULE-C27` for minimization of durable logs and evidence.

The integration provider may hold and refresh OAuth credentials according to its connection model. CoMind stores only the metadata needed for governance and operations, such as provider, toolkit, account or resource scope when safe, connection state, verification time, authority basis, action provenance, and result. Raw access tokens, refresh tokens, authorization headers, passwords, API keys, client secrets, service-role keys, and equivalent material are prohibited from RuleBook context and RunBook evidence.

Connection health uses explicit operational states. `ACTIVE` means a connection is presently usable. `AUTH_REQUIRED`, `SCOPE_REQUIRED`, `EXPIRED`, `HUMAN_CONFIRMATION_REQUIRED`, and `BLOCKED` are checkpoint states. They do not authorize bypass or credential substitution. When a connection blocks one operation, the lane should preserve the exact blocker and continue dependency-independent authorized work when possible.

### ChatGPT plugin boundary

The ChatGPT-hosted Composio plugin executes outside the CoMind server runtime, so CoMind cannot technically intercept that plugin call with the server-side RuleBook preflight. During this path, the acting lane must apply the same authority and control checks procedurally and preserve durable evidence. This is an explicit enforcement boundary, not an exemption.

### CoMind runtime boundary

A CoMind-hosted agent, Virtual Employee, application service, or orchestrator that invokes Composio or another integration broker must call the common RuleBook operational preflight before the consequential provider action. The runtime must fail closed on missing authority, malformed control context, `deny`, `review` without required human approval, unavailable preflight, or a platform-required confirmation.

CIG-001 connection verification and canonicalization evidence is recorded under GitHub issue #414 and the `CIG-001` Durable RunBook work item. Production remains unchanged.

## Governed provider adoption

The first product-path adoption of the common preflight is the governed provider-execution broker. Before that broker may count input tokens, quote cost exposure, reserve budget, admit a paid execution, or call a provider, it must receive `allow` decisions from:

1. `DRULE-C11` for the structured trust boundary;
2. `DRULE-C17` for tenant and project isolation;
3. `DRULE-C13` for the governed asset and outbound destination.

`deny`, `review`, malformed output, evaluator failure, missing structured context, inconsistent tenant identity, or undeclared context keys stop the broker before provider work begins.

The OpenAI governed wrapper binds its destination server-side rather than accepting destination identity from request content. The current Test binding uses `OPENAI-API`, host policy `api.openai.com`, region token `provider-managed`, and explicit operation actions. The bounded Test destination accepts no classification above `INTERNAL`, requires purpose, requires human review, and carries `production_authority=false`. It does not replace CoMind's separate paid-access approval and budget controls.

The shared execution-preflight helper accepts structured governance attributes only. It does not receive the raw prompt, message history, provider credential, authorization header, secret material, or API key.

### Current adoption boundary

The ordinary assistant provider path is not yet routed through this governed broker. That is intentional, not an implicit exemption.

A normal `AssistantResponseRequest` currently identifies a conversation and its messages but does not provide an authoritative RuleBook governed-asset classification for the outbound conversation content. CoMind will not silently classify every existing conversation as `INTERNAL`, because that can underclassify sensitive content. CoMind will also not classify every unknown conversation as `RESTRICTED` merely to make the integration compile, because that would intentionally block current provider operation without first establishing a migration path.

The prerequisite for normal assistant adoption is a durable server-side binding from the conversation or outbound provider payload to authoritative governance state. That binding must supply classification, tenant, project scope, purpose, and human approval from controlled state rather than caller assertions. Missing classification must fail closed once the governed path is activated.

Foundry adapter dispatch is also a separate adoption slice. The same shared helper is intended for Foundry, but Foundry's existing leasing, authorization, adapter, and live Test evidence will be changed and reviewed independently.

Evidence for the first provider-broker adoption is recorded in `docs/provenance/2026-10-29-drule-provider-egress-preflight-adoption.md`.

## Integration contract

A product lane resolves its use of one of these control families by registering governed assets/destinations/keys/obligations as needed and calling the common preflight before the consequential action. It should not clone the decision logic into a second policy implementation. External integration gateways follow the same rule: the broker supplies execution capability, while CoMind supplies authority and governance.

Existing product code is not silently rewritten by this remediation milestone. Adoption is explicit so that each owning lane can prove its own end-to-end enforcement without hidden cross-lane changes.

## Verification and evidence

The repository verifies:

- idempotent PostgreSQL 17 migration and seed execution;
- 12 control families and 36 atomic requirements;
- five ordered classifications;
- private RLS-enabled control-plane tables;
- no PUBLIC execute privilege on the database preflight;
- positive and negative/review runtime cases for all twelve controls;
- missing tenancy context denial;
- recursive rejection of raw-sensitive context fields;
- Fastify route validation and fail-closed behavior;
- governed provider preflight ordering and deny/review stops before token counting, reservation, or provider execution;
- CINT paid-provider and budget/replay compatibility behind the governed broker gate;
- Operator Console model behavior and TypeScript correctness.

Live Supabase Test additionally verifies safe HUD grants, Cron registration, current advisor findings, Test readback, and the bounded provider-egress allow/review/deny matrix.

## Production boundary

This document and implementation establish reusable governance capability, bounded governed-provider adoption, and Test evidence. They do not authorize production deployment, production RLS changes, cross-tenant production operation, certification claims, product-specific high-consequence use, or an OpenAI paid request. Those transitions require the appropriate lane owner, environment evidence, and authority decision.
