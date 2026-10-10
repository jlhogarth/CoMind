# GOV-001: Standards baseline, ISO setup, and VE identity inventory

Date: 2026-10-10
Issue: #90
Base main: `803ce59482edcc016b4a462a23acb70f54937b98`
Status: Initial repository evidence assessment. Not an ISO conformity claim.

## Verified repository assets and gaps

| Area | Evidence in main | Status / next verification |
| --- | --- | --- |
| Agent identity and profile | `db/migrations/20261008_006_foundry_agent_substrate.sql`: `cm_foundry_agent_profile` links `cm_agent`, `cm_actor`, organization, role code, display name and authority ceiling | Schema exists in repository; deployed inventory and runtime adoption unverified |
| Scoped capability authority | Same migration: capability, grants, authorization request and decision | Database design exists; effectiveness for live adapters unverified |
| Fail-closed orchestration | `server/src/foundry-runtime.ts` and `docs/provenance/2026-10-08-foundry-runtime-orchestration.md` | Isolated deterministic adapter test described; production adapters not established |
| Shared deliberation | Foundry deliberation tables and runtime protocol in runtime provenance | Protocol exists; cross-agent production coordination not demonstrated |
| Recovery | Foundry checkpoints and runtime recovery contract | Isolated replay tests described; full disaster recovery unverified |
| Data access | `20261008_007_foundry_security_prerequisites.sql` | Repository migration only. Prior read-only assessment reported 75 of 79 live `comind` tables lacked RLS; **must recheck live posture before deployment** |
| Budget and cost | `cm_budget_authority_binding` and FinOps migration | Existing authority to reuse, not duplicate |
| Standards management | No verified ISO AIMS/control registry in inspected files | Open gap |
| Automated tier enforcement | Provisional policy added to `AGENTS.md` | Open implementation gap: not a runtime gate |
| Formal audit | No verified ISO internal audit, management review or certification scope | Open organizational gap |

## Standards program setup

Proposed primary AI management system: ISO/IEC 42001. Supporting: ISO/IEC 23894 AI risk guidance; NIST AI RMF; NIST SP 800-53 security controls; OWASP agentic threat guidance; MITRE ATLAS adversarial scenarios. MCP and A2A are interoperability protocols, not certifications. Verify current editions, licensing, legal applicability, and authoritative source documents before asserting clause-level coverage.

Initial AIMS artifacts required: scope statement and exclusions; AI policy; organizational responsibility matrix; AI inventory; impact and risk assessment; risk treatment and acceptance; control applicability register; operational evidence retention; incident and corrective action register; competence/training; internal audit plan; management review schedule; certification-readiness evidence register. Define CoMind Inc. as proposed organization only after responsible management approves scope.

Registry record contract (proposed, not deployed): `control_id, framework, edition, source_reference, applicability, rationale, owner, tier, risk, implementation_reference, verification_method, evidence_reference, observed_status, assessed_at, exception_owner, exception_expiry`. Preserve source licensing. Evidence must refer to observed tests, not aspirational designs.

## Virtual Employee naming migration

Canonical identity is immutable; human-friendly display names and aliases are mutable. The schema already distinguishes `role_code` from `display_name`. Do not change role codes, `agent_id`, `actor_id`, database foreign keys, GitHub workflows or provenance references in this milestone.

### Existing role documents observed in connected Drive (documentation, not deployed agents)

| Existing document persona | Proposed understandable display name |
| --- | --- |
| RADAR, Principal Technical Program Architect | Program Architect |
| SYNAPSE, Principal AI Systems Architect | AI Systems Architect |
| VAULT, Principal Database Architect | Database Architect |
| FORGE, Principal Software Engineer | Software Engineer |
| ATLAS, Principal Systems Architect | Systems Architect |
| SENTRY, Principal DevSecOps and SRE | Security and Reliability Engineer |
| PROOF, Principal Verification Engineer | Verification Engineer |

Other legacy names including ARIS, CRIS, SEAL and SOAP require repository and document mapping before migration. These rows are proposals only and do not prove any persona is instantiated in Supabase or running. Resolve duplicate architect roles and the complete agent population before approving names.

### Proposed new role

`ISO | Compliance and Standards Officer`: shadow-mode, read-only standards registry steward; reports gaps and proposed corrective actions; no production mutations, certification assertions, self-approval or authority escalation. Creation of an actual VE profile, its grants, database migration and runtime activation is a separate approved milestone.

## Immediate execution order

1. Finish repository and read-only live inventory, including current branches, actual `cm_agent` and Foundry profiles, policies and deployed schema. Never assume repository migrations have been applied live.
2. Confirm applicable standards editions and establish the first control crosswalk with verified evidence and human owners.
3. Review all proposed display names with the founder, then implement alias-safe changes and regression tests separately.
4. Build ISO AIMS artifacts and evidence registry, preferably using existing database authorities rather than parallel ledgers.
5. Introduce automated tier checks at PR acceptance and runtime policy enforcement, with latency and cost budgets measured against the Interactive Runtime Performance baseline.
6. Exercise multi-agent conflict, prompt injection, revoked delegation, audit failure, and recovery cases in isolated tests.

## Acceptance boundary

GOV-001 may close only when its inventory and standards applicability evidence are verified and the next implementation backlog is explicit. No live Supabase changes, paid provider requests, autonomous agent activation, or certification claims are authorized by this document. A PR must be tested at its final head before merge.
