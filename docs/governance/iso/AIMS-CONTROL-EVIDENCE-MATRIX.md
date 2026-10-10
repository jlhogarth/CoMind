# CoMind AIMS Control-to-Evidence Matrix

Date: 2026-10-10
Status: Initial evidence inventory for GOV-001. This is not a clause-complete ISO/IEC 42001 mapping and is not a conformity assessment.

## Evidence-state vocabulary

Use one of these states for every control assertion:

- **PROPOSED:** desired control exists only as a plan or decision.
- **REPOSITORY_IMPLEMENTED:** code/policy/migration exists in source control; execution effectiveness is not yet proven.
- **ISOLATED_VERIFIED:** deterministic test or disposable-database evidence demonstrates the control in an isolated environment.
- **VERIFIED_NOT_DEPLOYED:** read-only observation proves the intended control/schema is absent from the live target.
- **DEPLOYED_UNVERIFIED:** deployment is believed or recorded, but current effectiveness has not been independently rechecked.
- **OPERATING_EVIDENCE:** repeated real operation produces retained evidence against defined acceptance criteria.
- **INDEPENDENTLY_ASSESSED:** an appropriately independent review/audit has evaluated the control.
- **GAP:** required or desired control lacks sufficient implementation/evidence.

Never promote a state based on confidence, documentation volume, or intent.

## Initial matrix

| Control objective | CoMind implementation/evidence reference | Current evidence state | Gap / next proof |
| --- | --- | --- | --- |
| Governance policy and evidence-before-success rule | `AGENTS.md`; `AIMS-AI-POLICY-DRAFT.md` | REPOSITORY_IMPLEMENTED; management policy not yet approved | Formal policy approval; prove systematic PR/runtime enforcement and exception handling |
| Engineering risk classification | `AGENTS.md` T0-T3 provisional governance policy | REPOSITORY_IMPLEMENTED | Automated checks and historical operating evidence absent |
| Human authority boundary | Existing C0-C4 conventions; repository Foundry grant/authorization substrate | ISOLATED_VERIFIED; live Foundry substrate VERIFIED_NOT_DEPLOYED | Production deny-by-default requires separate deployment/hardening milestone |
| Agent/actor identity lineage | `cm_agent`, `cm_actor`, repository `cm_foundry_agent_profile`; live evidence snapshot | Repository Foundry identity ISOLATED_VERIFIED; live Foundry profile VERIFIED_NOT_DEPLOYED; live `cm_agent` count 0 | Deploy only after security readiness and separate authorization |
| Least-privilege capability grants | Repository Foundry capability/grant schema and runtime broker | ISOLATED_VERIFIED; live capability table VERIFIED_NOT_DEPLOYED | Prove deployment, adapter coverage, revocation propagation and scope enforcement |
| Separation of request and decision provenance | Repository Foundry authorization request/decision | ISOLATED_VERIFIED; live tables VERIFIED_NOT_DEPLOYED | Apply approved separation-of-duties model after deployment |
| Fail-closed runtime authorization | `server/src/foundry-runtime.ts`; Foundry orchestration integration tests | ISOLATED_VERIFIED; not a live production control | Production adapter integration absent; C3/C4 runtime deliberately unsupported |
| Recovery and checkpoint provenance | Foundry recovery substrate plus ACP-001 PR #84 in parallel | PARTIAL / parallel work | Do not map #84 as accepted evidence until merged and final-head verified |
| Durable work ownership / no silent delegated work | Policy in `AGENTS.md`; Foundry work-lease kernel merged in PR #86 | REPOSITORY_IMPLEMENTED / isolated CI evidence; live deployment not verified | Do not claim operating work-lease control until deployment and operating evidence exist |
| Performance impact of governance | Interactive Runtime Performance baseline 008 merged in PR #96 and held in trigger-driven monitoring | BASELINE_ACCEPTED / monitoring trigger state | Set explicit thresholds before runtime compliance hooks; do not reopen instrumentation absent a material trigger |
| Budget authority / AI cost governance | FinOps migration/specification and repository budget authority binding | REPOSITORY_IMPLEMENTED / prior isolated verification documented; live `cm_budget_authority_binding` VERIFIED_NOT_DEPLOYED | Reconcile migration delta before any production paid-provider autonomy |
| Provider call governance | Governed provider execution wrapper/provenance docs and tests | ISOLATED_VERIFIED based on repository evidence | Verify exact live integration path and supplier/model change controls |
| Database row-level security | `20261008_007_foundry_security_prerequisites.sql`; `LIVE-READ-ONLY-EVIDENCE-2026-10-10.md` | VERIFIED_NOT_DEPLOYED live: 75/79 `comind` tables have RLS disabled | Dedicated migration-readiness/hardening issue, then post-deployment advisor/catalog proof |
| Broad database access prevention | Repository security prerequisite migration; live policy inspection | GAP live: unconditional `true` policy expressions remain on conversation/document/message tables | Redesign/verify intended Data API access and least-privilege policies before autonomy |
| Database function search-path hardening | Repository security prerequisite migration; live Security Advisor | VERIFIED_NOT_DEPLOYED: same 7 mutable-search-path findings observed live | Deploy hardening separately and re-run advisor/catalog verification |
| Append-only authorization/execution provenance | Repository Foundry substrate mutation guards and terminal result/outcome model | ISOLATED_VERIFIED; live substrate VERIFIED_NOT_DEPLOYED | Validate deployment, retention, backup integrity and long-term queryability later |
| Inter-agent deliberation integrity | Repository Foundry deliberation events/outcomes and dissent-aware tests | ISOLATED_VERIFIED; no live agent instances observed | Real multi-agent drill and adversarial conflict/compromised-agent scenarios absent |
| Prompt/output and agentic security | Fail-closed broker patterns; standards register includes OWASP Agentic Top 10 and MITRE ATLAS | PARTIAL | Threat-model coverage, red-team tests and traceable mitigations not yet complete |
| AI supplier management | `AIMS-AI-SYSTEM-AND-SUPPLIER-INVENTORY.md` defines required record | REPOSITORY_IMPLEMENTED as process design; operating inventory GAP | Populate supplier inventory, due diligence, data-flow, contingency and reassessment evidence |
| AI system inventory | Live module inventory shows 5 registered modules and 0 `cm_agent` rows; inventory contract exists | PARTIAL / operating inventory GAP | Reconcile repository modules/agents/models/providers/tools/data flows into controlled inventory |
| AI risk register | `AIMS-RISK-AND-IMPACT-REGISTER.md` | REPOSITORY_IMPLEMENTED as record contract; operating risk register not yet populated | Create first evidence-backed risks, owners/treatments and review dates |
| Incident and corrective action | `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` | REPOSITORY_IMPLEMENTED as process design | Establish actual incident/nonconformity records and effectiveness evidence when operating |
| Internal audit | `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` | REPOSITORY_IMPLEMENTED as process design | Assign sufficiently independent human reviewer and conduct first audit after AIMS operates |
| Management review | `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` | REPOSITORY_IMPLEMENTED as process design | Formal management owner, first review package, decisions and retained record needed |
| Objectives and measurement | `AIMS-OBJECTIVES-AND-METRICS.md`; `docs/provenance/2026-10-10-runtime-performance-baseline-008.md` | REPOSITORY_IMPLEMENTED as measurement design; runtime baseline accepted | Approve targets only after relevant baselines are verified; runtime hooks require threshold decisions against baseline 008 |
| Human responsibility/separation | `AIMS-RESPONSIBILITY-MATRIX.md` | REPOSITORY_IMPLEMENTED as design | Assign named accountable humans and resolve role conflicts before operating AIMS |
| Training/competence | Responsibility model identifies competence need | GAP | Define role competencies and retained evidence for humans with AIMS responsibilities |
| Evidence retention | Append-only provenance exists for selected repository runtime records; AIMS process requires retention design | PARTIAL | Define legal/contractual retention, classification, minimization, legal hold and disposal |
| Standards surveillance | `STANDARDS-APPLICABILITY-REGISTER.md`; audit/review cadence | REPOSITORY_IMPLEMENTED | Activate surveillance only with approved cadence/source access; ISO VE later supports shadow monitoring |
| Certification claims control | `AIMS-SCOPE-DRAFT.md` and `AIMS-AI-POLICY-DRAFT.md` prohibit unsupported claims | REPOSITORY_IMPLEMENTED | Add communications/release review if certification program proceeds |

## Verified live baseline reference

`LIVE-READ-ONLY-EVIDENCE-2026-10-10.md` records the current Supabase observation. It is the authoritative GOV-001 evidence for live schema/security assertions made in this matrix until superseded by a newer controlled observation.

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
