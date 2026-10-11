# CoMind AIMS Management Review Package

Date: 2026-10-11  
Status: Controlled operating template. Completion of this template is not itself proof that a management review occurred.

## Purpose

Provide one repeatable evidence package for human AIMS management review. The package collects evidence and decisions without converting missing telemetry, draft policy, supplier marketing, repository implementation, or isolated verification into operating effectiveness.

The accountable AIMS management owner remains human. Virtual Employees may prepare summaries and evidence indexes only within granted authority; they may not approve their own findings, accept material risk, certify CoMind, or substitute consensus for management accountability.

## Review identity and scope

Each completed review record must identify:

- review ID and date;
- accountable human chair/approver;
- participants and role IDs;
- scope and systems/components covered;
- evidence cutoff date/time;
- prior review reference;
- extraordinary trigger if the review is event-driven;
- conflicts/independence limitations that materially affect conclusions.

## Required input 1 — Prior actions and decisions

Review every open action from the prior management review, audit, exception, risk acceptance, incident, or corrective-action record.

Record:

- action/decision identifier;
- owner;
- due/review trigger;
- current evidence state;
- closure evidence or reason still open;
- overdue/blocking dependencies.

Absence of evidence is not closure.

## Required input 2 — Context, scope, interested parties and standards

Review material changes to:

- AIMS scope and products/services;
- internal/external context;
- interested-party requirements;
- applicable law, regulation, contract or customer requirement when authoritatively established;
- standards/framework editions or material public guidance;
- certification objective or funding gate.

ISO/IEC 42001 normative verification remains `PENDING_LICENSED_SOURCE` until lawful licensed access exists. Paid normative/certification work remains funding-gated unless management explicitly changes that decision.

## Required input 3 — Objectives and metrics

Use `AIMS-OBJECTIVES-AND-METRICS.md` and current metric evidence.

At minimum review:

- consequential execution authorization coverage;
- revoked/expired authority failures;
- system inventory completeness;
- supplier governance state;
- high/critical risk ownership;
- unsupported claims;
- evidence freshness;
- incident/corrective-action effectiveness;
- silent delegated-work loss;
- governance/runtime-performance impact;
- unexpected provider spend;
- recovery reliability;
- agentic security test coverage;
- approval usability/fatigue;
- repeated findings/continual improvement.

Do not invent a numerical target where management has not approved one or where a defensible baseline is absent.

## Required input 4 — System inventory and intended use

Review `aims-system-inventory.csv` and `AIMS-INTENDED-USE-AND-OVERSIGHT-BASELINE.md`.

Required questions:

- Are all current material AI-enabled systems/components represented?
- Has intended/prohibited use changed?
- Has lifecycle, deployment, evidence or external-interaction state changed?
- Are human-oversight and authority boundaries still appropriate?
- Is any repository/isolated control being misrepresented as deployed or operating?
- Has ACP or any other parallel lane merged and therefore changed inventory/risk assumptions?

## Required input 5 — Risk and impact

Review `aims-system-risk-baseline.csv` plus any newer risk/impact records.

At minimum identify:

- open high/critical risks;
- named human risk owners or assignment gaps;
- treatments and dependencies;
- expired/expiring acceptance or exception decisions;
- incidents/findings affecting risk;
- changes in blast radius, authority, data sensitivity, recovery or supplier concentration;
- residual risk requiring management decision.

Agent or reviewer consensus is not risk acceptance.

## Required input 6 — Incidents, nonconformities and corrective action

Review the incident/escalation matrix and all actual incident/finding/corrective-action records since the last review.

Required questions:

- Were severity and human escalation applied correctly?
- Were evidence and dissent preserved?
- Were unsupported claims corrected promptly?
- Are legal/contract/customer notification obligations resolved by an authoritative source where applicable?
- Has corrective-action effectiveness been verified rather than inferred from implementation?
- Are any incident patterns recurring?

A blank incident list means no incident record was supplied; it does not prove that no incidents occurred.

## Required input 7 — Supplier and provider governance

Review `aims-supplier-inventory.csv` and `aims-supplier-governance-register.csv`.

At minimum review:

- OpenAI, Supabase, GitHub and npm ecosystem coverage;
- due-diligence and assurance gaps;
- material changes in terms, data use, subprocessors, region, model/version or package ownership;
- incidents/outages;
- criticality and concentration;
- fallback and tested exit readiness;
- provider/model independence domain;
- BYOK/BYOM/BYOP/CoMind-managed acquisition implications where applicable;
- cost and lock-in exposure.

No supplier assurance may be upgraded from a marketing page or assumption alone.

## Required input 8 — Competence, awareness and independence

Review `aims-role-competence-register.csv`.

At minimum identify:

- unassigned required role families;
- competence-evidence gaps;
- training/awareness needs;
- independence/conflict constraints for verification/audit;
- incident-response readiness;
- changes in system/provider/data responsibility requiring competence reassessment.

Role assignment alone does not prove competence.

## Required input 9 — Audit, evidence integrity and retention

Review:

- internal/external audit or targeted review results;
- control-to-evidence matrix changes;
- stale/unavailable evidence;
- evidence-integrity concerns;
- retention/disposition schedule exceptions;
- legal/contract holds if authoritatively established;
- public/customer assurance claims and their current evidence state.

A passing CI run remains technical evidence, not an AIMS internal audit.

## Required input 10 — Resources, funding, FinOps and performance

Review:

- current staffing/role-capacity gaps;
- funding constraints affecting controls, licensed standards, external assessments or certification;
- provider/API spend and budget authority;
- infrastructure/service costs where material;
- governance/runtime overhead and Interactive Runtime Performance evidence;
- capacity bottlenecks, approval fatigue and operational sustainability.

Current funding decision: paid ISO normative material and certification-related spend are deferred until funding unless management explicitly changes that decision.

## Required outputs

A completed management review must record explicit decisions or an explicit `NO_CHANGE` conclusion for each applicable output family:

1. **AIMS scope/policy/process changes** — owner and effective/review trigger.
2. **Risk decisions** — treatment, escalation, bounded acceptance or refusal to accept; human authority identified.
3. **Control improvements** — implementation owner, evidence required and dependency.
4. **System/architecture/provider decisions** — including provider-independence or acquisition-mode implications.
5. **Supplier actions** — due diligence, reassessment, contingency, exit test or replacement decision.
6. **Objectives/metrics** — approved target/change or explicit decision to remain baseline-first.
7. **Competence/resources** — assignments, training, independent review or staffing/funding action.
8. **Audit/corrective-action direction** — scope, independence and closure authority.
9. **Evidence/retention actions** — freshness, integrity, disposition or hold decisions.
10. **Certification-readiness direction** — explicitly distinguish readiness work from any certification/conformity claim.

Every action must identify an owner and due date or event-driven review trigger. If no calendar due date is justified, use a concrete trigger rather than inventing one.

## Extraordinary review triggers

Open an out-of-cycle management review when materially justified by:

- critical governance/evidence breach;
- unauthorized consequential action;
- significant security/privacy incident;
- material provider/supplier/model change or outage;
- new consequential/regulated use case;
- major AIMS scope or authority change;
- significant standards/regulatory/contractual applicability change;
- certification/funding decision;
- evidence that governance controls materially degrade safety, cost, reliability or interactive performance.

## Evidence and claim rules

A completed management-review record is an `EVIDENCE RECORD` and should preserve its original decision state. Corrections must retain prior text/decision lineage, correcting actor, date and rationale.

Never substitute a completed template, meeting attendance, confidence, consensus, documentation volume, or user approval for evidence that a control is deployed, operating, effective, legally required, independently assessed, conformant, or certified.
