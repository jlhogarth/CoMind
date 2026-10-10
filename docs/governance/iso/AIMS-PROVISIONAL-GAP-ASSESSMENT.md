# CoMind Provisional ISO/IEC 42001 Gap Assessment

Date: 2026-10-10  
Status: GOV-002 provisional management-system assessment. Not a clause-complete ISO conformity assessment.

## Method

This assessment uses the management-system organization commonly associated with ISO/IEC 42001 clauses 4-10 plus the 38 Annex A identifiers present in the pinned secondary toolkit. It does not reproduce the toolkit's 124 questionnaire items and does not claim access to ISO normative wording.

Ratings:

- **ESTABLISHED_DESIGN** — CoMind has a controlled repository design/process artifact.
- **PARTIAL_EVIDENCE** — relevant implementation/test evidence exists, but the management-system control is incomplete or not operating.
- **GAP** — material implementation or evidence is absent.
- **BLOCKED** — work is intentionally gated by funding, production authority, dependency, or scope decision.

## Management-system family assessment

| Family | Provisional rating | Current CoMind evidence | Material next gap |
| --- | --- | --- | --- |
| Context and AIMS scope | ESTABLISHED_DESIGN | `AIMS-SCOPE-DRAFT.md`; context/interested-party record | Final commercial/certification boundary and market/legal scope |
| Leadership and AI policy | ESTABLISHED_DESIGN | AI policy draft; Founder/CEO designated interim AIMS owner | Formal controlled policy approval/communication and operating evidence |
| Roles, responsibilities and authority | ESTABLISHED_DESIGN | `AIMS-RESPONSIBILITY-MATRIX.md`; C0-C4 and T0-T3 governance | Assign named control/risk/audit owners as organization grows |
| Planning, risk and opportunity | PARTIAL_EVIDENCE | risk/impact method and seeded risk register | Populate complete operating risk register and treatment evidence |
| Objectives and metrics | PARTIAL_EVIDENCE | `AIMS-OBJECTIVES-AND-METRICS.md`; runtime/FinOps metrics | Establish approved baselines/targets and recurring review evidence |
| Resources and competence | GAP | responsibility model identifies roles | Controlled competence requirements, training/experience evidence and resource plan |
| Communication and documented information | PARTIAL_EVIDENCE | documentation-control design; GitHub provenance | Formal internal/external communication rules, approvals and retention schedule |
| Operational AI lifecycle controls | PARTIAL_EVIDENCE | issue/branch/PR discipline, CI, Foundry isolated verification | System-specific lifecycle records, intended-use records and production operating evidence |
| AI risk and impact assessment in operation | GAP | assessment method exists | Completed system-level impact assessments before consequential deployment |
| Monitoring and measurement | PARTIAL_EVIDENCE | CI, runtime performance, FinOps and provenance mechanisms | Operating thresholds, drift/fairness/security monitoring and management reporting |
| Internal audit | GAP | audit process design | Assign sufficiently independent reviewer and conduct first AIMS audit after operation begins |
| Management review | GAP | review-process design | First retained management-review package and decisions |
| Nonconformity/corrective action | PARTIAL_EVIDENCE | corrective-action process design | Actual controlled findings, root-cause/treatment/effectiveness records |
| Continual improvement | PARTIAL_EVIDENCE | evidence-driven development and corrective-action design | Recurring AIMS improvement cycle with trend evidence |
| Annex A control applicability | PARTIAL_EVIDENCE | 38-control provisional SoA/crosswalk | Normative licensed review plus evidence closure for GAP rows |
| ISO normative verification | BLOCKED | source boundary documented | Funding for lawful licensed source; then controlled normative crosswalk review |
| External certification | BLOCKED | claim boundary documented | Mature operating AIMS, internal audit, management review, corrective actions and funded certification body |

## Highest-priority evidence gaps

1. **Production database security readiness.** GOV-001 live evidence showed repository hardening is not deployed; production VE autonomy therefore remains blocked.
2. **Controlled AI-system/data/tool/supplier inventory.** The record structure exists but is not yet complete as an operating inventory.
3. **System-specific risk and impact assessments.** The method exists; completed assessments must precede consequential production use.
4. **Competence and human-role evidence.** Human accountability is defined, but formal competence/training records do not yet exist.
5. **Incident reporting and external communication.** Technical recovery structures exist, but management-system notification/escalation records are incomplete.
6. **Intended-use and user-information records.** CoMind needs system-level purpose, limits, oversight and out-of-scope-use controls.
7. **Supplier governance.** Provider/tool dependencies need due diligence, data-flow, contractual, continuity and reassessment evidence.
8. **Internal audit and management review.** These cannot be simulated by documentation alone; they require operating AIMS evidence and sufficiently independent human review.

## Annex A evidence view

The 38-control row-level evidence state is maintained in `aims-provisional-crosswalk.csv` and rendered in `AIMS-STATEMENT-OF-APPLICABILITY-PROVISIONAL.md`.

GOV-002 deliberately exposes `GAP` and `PROPOSED` states instead of maximizing a compliance percentage. A completeness score without normative verification and operating evidence would create false confidence.

## Next treatment sequence after GOV-002

1. Reconcile/complete AI-system, data, tool and supplier inventories.
2. Create system-specific intended-use, risk and impact records for the first deployable CoMind capability set.
3. Close the separately identified live database security/readiness blocker through its own authorized lane.
4. Establish competence, incident communication, evidence-retention and supplier-governance operating procedures.
5. Run the first controlled AIMS management review once enough operating evidence exists.
6. After funding, obtain lawful ISO/IEC 42001 normative access and reconcile every provisional mapping before any conformity-readiness assertion.
