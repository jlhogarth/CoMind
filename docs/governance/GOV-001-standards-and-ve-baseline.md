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

## Virtual Employee identity directory: naming decision

Decision 2026-10-10: retain all established CoMind agent names and conventions. The founder withdrew the renaming proposal. GOV-001 must not change existing agent display names, role codes, identities, aliases, or references. Instead, create a descriptive agent role directory and inspect instantiated profiles separately from design-document personas. The proposed new ISO compliance role remains in scope, initially read-only and in shadow mode, subject to separate authorization before activation.

## Immediate execution order

1. Finish repository and read-only live inventory, including current branches, actual `cm_agent` and Foundry profiles, policies and deployed schema. Never assume repository migrations have been applied live.
2. Confirm applicable standards editions and establish the first control crosswalk with verified evidence and human owners.
3. Build a clear directory mapping existing canonical agent names to verified responsibilities, deployment state, and authority. Do not rename agents.
4. Build ISO AIMS artifacts and evidence registry, preferably using existing database authorities rather than parallel ledgers.
5. Introduce automated tier checks at PR acceptance and runtime policy enforcement, with latency and cost budgets measured against the Interactive Runtime Performance baseline.
6. Exercise multi-agent conflict, prompt injection, revoked delegation, audit failure, and recovery cases in isolated tests.


## Parallel-work protection and deferred module registry

Active parallel pull requests inspected on 2026-10-10: #88 interactive runtime performance, #86 Foundry work-lease kernel, and #84 ACP durable continuity. GOV-001 owns documentation and compliance planning only until integration dependencies are reviewed; do not edit their code, schema, workflow, or shared runtime contracts in this lane. The VE Management Dashboard is registered as a deferred module in `docs/roadmap/virtual-employee-management-dashboard.md`, with the full Agent Directory, operations, human approvals, governance, performance, and continuity backlog. It is not a current GOV-001 blocker.

### ISO implementation next steps without shared runtime changes

1. Define draft AI management-system scope, accountable human roles, exclusions and certification boundary for approval.
2. Build a standards applicability register using exact editions and authoritative licensed sources. Mark all clause mappings unverified until examined.
3. Create a control-to-evidence matrix referencing existing repository controls and explicitly marking design-only, tested-in-isolation, deployed and independently assessed states.
4. Identify evidence retention, exceptions, internal-audit independence, management-review cadence, supplier and model-provider obligations, and risk acceptance authority.
5. Prepare a read-only ISO shadow-mode role contract; defer actual profile/grants/runtime activation to a separately authorized isolated implementation issue.
6. Gate any future runtime policy hooks on merge coordination with #86/#84/#88 and latency/cost baseline checks.

## Acceptance boundary

GOV-001 may close only when its inventory and standards applicability evidence are verified and the next implementation backlog is explicit. No live Supabase changes, paid provider requests, autonomous agent activation, or certification claims are authorized by this document. A PR must be tested at its final head before merge.
