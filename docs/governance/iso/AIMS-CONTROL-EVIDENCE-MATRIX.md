# CoMind AIMS Control-to-Evidence Matrix

Date: 2026-10-10
Status: Initial evidence inventory for GOV-001. This is not a clause-complete ISO/IEC 42001 mapping and is not a conformity assessment.

## Evidence-state vocabulary

Use one of these states for every control assertion:

- **PROPOSED:** desired control exists only as a plan or decision.
- **REPOSITORY_IMPLEMENTED:** code/policy/migration exists in source control; execution effectiveness is not yet proven.
- **ISOLATED_VERIFIED:** deterministic test or disposable-database evidence demonstrates the control in an isolated environment.
- **DEPLOYED_UNVERIFIED:** deployment is believed or recorded, but current effectiveness has not been independently rechecked.
- **OPERATING_EVIDENCE:** repeated real operation produces retained evidence against defined acceptance criteria.
- **INDEPENDENTLY_ASSESSED:** an appropriately independent review/audit has evaluated the control.
- **GAP:** required or desired control lacks sufficient implementation/evidence.

Never promote a state based on confidence, documentation volume, or intent.

## Initial matrix

| Control objective | CoMind implementation/evidence reference | Current evidence state | Gap / next proof |
| --- | --- | --- | --- |
| Governance policy and evidence-before-success rule | `AGENTS.md` no-placeholder and evidence requirements | REPOSITORY_IMPLEMENTED | Prove systematic PR/runtime enforcement and exception handling |
| Engineering risk classification | `AGENTS.md` T0-T3 provisional governance policy | REPOSITORY_IMPLEMENTED | Automated checks and historical operating evidence absent |
| Human authority boundary | Existing C0-C4 conventions; `cm_foundry_capability_grant`, authorization request/decision substrate | ISOLATED_VERIFIED for Foundry substrate | Verify deployed adoption; prove production deny-by-default before consequential use |
| Agent/actor identity lineage | `cm_agent`, `cm_actor`, `cm_foundry_agent_profile` in Foundry substrate migration | ISOLATED_VERIFIED | Read-only live inventory and uniqueness/effective-state verification |
| Least-privilege capability grants | Foundry capability/grant schema and runtime broker contract | ISOLATED_VERIFIED | Prove adapter coverage, revocation propagation and production scope enforcement |
| Separation of request and decision provenance | `cm_foundry_authorization_request` and `cm_foundry_authorization_decision` | ISOLATED_VERIFIED | Define human approval/separation-of-duties policy by risk tier |
| Fail-closed runtime authorization | `server/src/foundry-runtime.ts`; Foundry orchestration integration tests | ISOLATED_VERIFIED | Production adapter integration not established; C3/C4 runtime deliberately unsupported |
| Recovery and checkpoint provenance | Foundry recovery checkpoint substrate plus ACP-001 PR #84 in parallel | PARTIAL / parallel work | Do not map #84 as accepted evidence until merged and final-head verified |
| Durable work ownership / no silent delegated work | Policy in `AGENTS.md`; Foundry work-lease PR #86 in parallel | PROPOSED + parallel implementation | Do not claim work-lease control until #86 is merged and independently verified |
| Performance impact of governance | Interactive runtime performance PR #88 in parallel | PROPOSED + parallel implementation | Establish stable baseline and thresholds before runtime compliance hooks |
| Budget authority / AI cost governance | FinOps migration/specification and budget authority binding reused by Foundry | REPOSITORY_IMPLEMENTED / prior isolated verification documented | Recheck current deployment, provider-price/version accuracy and operating evidence |
| Provider call governance | Governed provider execution wrapper/provenance docs and tests | ISOLATED_VERIFIED based on repository evidence | Verify exact live integration path and supplier/model change controls |
| Database row-level security | `20261008_007_foundry_security_prerequisites.sql` repository hardening | REPOSITORY_IMPLEMENTED; live posture UNVERIFIED | Prior read-only evidence found 75/79 live tables without RLS; recheck before any claim |
| Broad database access prevention | Security prerequisite migration revokes PUBLIC/anon/authenticated where applicable | ISOLATED_VERIFIED in migration harness | Verify actual deployed roles/policies and intended Data API exposure |
| Database function search-path hardening | Security prerequisite migration addresses seven previously flagged functions | REPOSITORY_IMPLEMENTED / isolated verified | Re-run current Supabase advisor/read-only inspection before closure |
| Append-only authorization/execution provenance | Foundry substrate mutation guards and terminal result/outcome model | ISOLATED_VERIFIED | Validate retention, legal/privacy constraints, backup integrity and long-term queryability |
| Inter-agent deliberation integrity | Foundry deliberation events/outcomes, dissent-aware closure, silence-not-agreement tests | ISOLATED_VERIFIED | Real multi-agent operating drill, adversarial conflict and compromised-agent scenarios absent |
| Prompt/output and agentic security | Existing fail-closed broker patterns; OWASP/MITRE framework adoption in this register | PARTIAL | Threat-model coverage, red-team tests and traceable mitigations not yet complete |
| AI supplier management | Provider wrappers and cost governance provide technical observations | GAP at AIMS process level | Supplier inventory, due diligence, terms/data-flow assessment, change notification and contingency process needed |
| AI system inventory | Agent substrate and project artifacts contain partial inventory data | GAP at AIMS process level | Establish controlled inventory for models, providers, agents, datasets, RAG stores, tools and material versions |
| AI risk register | No authoritative AIMS risk register verified | GAP | Define scoring, owner, treatment, residual risk, acceptance authority, review and evidence links |
| Incident and corrective action | Technical recovery structures exist | GAP at management-system level | Establish AI/security incident record, root cause, corrective/preventive action and effectiveness review |
| Internal audit | No AIMS internal-audit process verified | GAP | Define scope, competence, independence, schedule, findings and closure evidence |
| Management review | No AIMS management-review cadence/evidence verified | GAP | Define required inputs, decisions, resource actions and retained minutes/records |
| Objectives and measurement | Performance/FinOps metrics exist in parts | PARTIAL | Define AIMS objectives, owner, target, measurement source, frequency and escalation |
| Training/competence | No controlled AIMS competence/training record verified | GAP | Define role competencies and retained evidence for humans with AIMS responsibilities |
| Evidence retention | Append-only provenance exists for selected runtime records | PARTIAL | Define retention schedule, evidence classification, legal holds, minimization and disposal |
| Standards surveillance | `STANDARDS-APPLICABILITY-REGISTER.md` | REPOSITORY_IMPLEMENTED | Define cadence and change-approval workflow; ISO VE later supports shadow monitoring |
| Certification claims control | `AIMS-SCOPE-DRAFT.md` prohibits unsupported certification/conformity claims | REPOSITORY_IMPLEMENTED | Incorporate into communications/release review if certification program proceeds |

## Initial control families for the AIMS backlog

The clause-complete ISO mapping will be created only from authorized access to the normative standard. Meanwhile, CoMind can safely organize work into these management/control families without pretending they are ISO clause labels:

1. Organizational context, scope, interested parties and objectives.
2. Leadership, accountability, policy and resources.
3. AI inventory, ownership, lifecycle and classification.
4. AI risk and impact assessment, treatment and acceptance.
5. Data, model, provider, tool and supply-chain governance.
6. Security, privacy, reliability, safety and misuse resistance.
7. Human oversight, delegated authority, transparency and accountability.
8. Development/change/release governance and secure SDLC.
9. Monitoring, measurement, performance, FinOps and operational evidence.
10. Incident, recovery, nonconformity and corrective action.
11. Competence, awareness, documentation and evidence retention.
12. Internal audit, management review and continual improvement.

## Evidence collection rules

- Reference exact commit SHA, PR, workflow run, test output, migration version, deployment record or audit artifact when available.
- Record environment and observation time.
- Separate design evidence from operating evidence.
- Preserve failure evidence; do not retain only successful runs.
- Record the verifier and verifier independence where relevant.
- For external standards, record edition/version and source.
- For living frameworks, record retrieval date.
- Never put secrets, raw credentials, unnecessary personal data, proprietary standard text, or hidden model reasoning into the evidence store.
- Evidence expiration is control-specific. A test that was valid for an earlier implementation head is not automatically valid for a later head.

## GOV-001 acceptance implication

This matrix intentionally exposes gaps. GOV-001 should not attempt to close all AIMS gaps. Its role is to establish the controlled system, identify evidence states honestly, define the next backlog, and avoid disrupting parallel technical build lanes.