# CoMind Provisional ISO/IEC 42001 Annex A Statement of Applicability

Date: 2026-10-10  
Status: GOV-002 provisional implementation view. Not a normative ISO mapping, conformity assessment, or certification claim.

## Rules

- Source of truth: `aims-provisional-crosswalk.csv`.
- Every ISO-specific normative verification remains `PENDING_LICENSED_SOURCE`.
- Control objectives below are CoMind-authored paraphrases, not ISO requirement text.
- `APPLICABLE` is a provisional CoMind scope decision; `UNDETERMINED` requires a later management/scope decision.
- Evidence state describes what CoMind has actually observed; it does not mean the ISO requirement has been satisfied.

| ID | CoMind control objective | Applicability | Tier | Evidence state |
| --- | --- | --- | --- | --- |
| `A.2.2` | Maintain an approved AI governance policy. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.2.3` | Align AI policy with security, privacy, data and engineering governance. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.2.4` | Review AI policy on cadence and material change. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.3.2` | Define accountable human and delegated AI roles. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.3.3` | Provide a durable route to report AI concerns and incidents. | APPLICABLE | T2 | GAP |
| `A.4.2` | Inventory resources needed across the AI lifecycle. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.4.3` | Govern data resources, provenance, sensitivity and allowed use. | APPLICABLE | T3 | GAP |
| `A.4.4` | Inventory and govern models, frameworks, libraries and tools. | APPLICABLE | T2 | GAP |
| `A.4.5` | Govern compute, storage, network and execution environments. | APPLICABLE | T2 | GAP |
| `A.4.6` | Define required human competence and staffing for AI governance. | APPLICABLE | T1 | GAP |
| `A.5.2` | Use a defined process to assess AI-system impacts. | APPLICABLE | T3 | REPOSITORY_IMPLEMENTED |
| `A.5.3` | Retain evidence of impact assessments and follow-up decisions. | APPLICABLE | T3 | REPOSITORY_IMPLEMENTED |
| `A.5.4` | Assess material impacts on individuals and identifiable groups. | APPLICABLE | T3 | PROPOSED |
| `A.5.5` | Assess broader societal and systemic impacts where material. | APPLICABLE | T3 | PROPOSED |
| `A.6.1.2` | Set measurable objectives for responsible AI development. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.6.1.3` | Use governed and traceable AI design/development processes. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.6.2.2` | Record intended purpose, requirements, constraints and acceptance criteria. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.6.2.3` | Maintain traceable technical and architectural design documentation. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.6.2.4` | Verify AI behavior against reliability, security and harm criteria. | APPLICABLE | T3 | ISOLATED_VERIFIED |
| `A.6.2.5` | Control deployment through authority, environment separation and rollback. | APPLICABLE | T3 | REPOSITORY_IMPLEMENTED |
| `A.6.2.6` | Monitor operation for failures, drift, cost and control degradation. | APPLICABLE | T2 | ISOLATED_VERIFIED |
| `A.6.2.7` | Maintain technical documentation of configuration, limits and dependencies. | APPLICABLE | T1 | REPOSITORY_IMPLEMENTED |
| `A.6.2.8` | Record material AI events with identity, authority, outcome and provenance. | APPLICABLE | T3 | ISOLATED_VERIFIED |
| `A.7.2` | Define data requirements and allowed uses for AI systems. | APPLICABLE | T3 | GAP |
| `A.7.3` | Govern data acquisition with authority, provenance and access restrictions. | APPLICABLE | T3 | GAP |
| `A.7.4` | Define and verify data-quality criteria appropriate to purpose and risk. | APPLICABLE | T3 | GAP |
| `A.7.5` | Preserve data lineage, origin, transformations and permitted use. | APPLICABLE | T3 | REPOSITORY_IMPLEMENTED |
| `A.7.6` | Govern data preparation, transformation, labeling and bias handling. | APPLICABLE | T3 | GAP |
| `A.8.2` | Provide users/operators material information about purpose, limits and oversight. | APPLICABLE | T2 | GAP |
| `A.8.3` | Define accountable routes for required external AI reporting. | APPLICABLE | T3 | GAP |
| `A.8.4` | Communicate material AI incidents through defined escalation and timing rules. | APPLICABLE | T3 | GAP |
| `A.8.5` | Define AI information that must be communicated to interested parties. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.9.2` | Define responsible-use processes including oversight, authority and escalation. | APPLICABLE | T3 | REPOSITORY_IMPLEMENTED |
| `A.9.3` | Set measurable objectives and boundaries for responsible AI use. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.9.4` | Document intended use and prevent or escalate material out-of-scope use. | APPLICABLE | T3 | GAP |
| `A.10.2` | Allocate responsibilities across AI providers, integrators and operators. | APPLICABLE | T2 | REPOSITORY_IMPLEMENTED |
| `A.10.3` | Assess and monitor AI suppliers, terms, data flows, continuity and change risk. | APPLICABLE | T3 | GAP |
| `A.10.4` | Define customer responsibilities and commitments when CoMind is provided as a service. | UNDETERMINED | T2 | GAP |

## Current applicability summary

- Provisional controls represented: **38**.
- Provisional applicable: **37**.
- Undetermined: **1**.
- Not applicable: **0**.

`A.10.4` remains undetermined until CoMind's commercial/customer and certification boundary is formally fixed. No other control is excluded in GOV-002; this is a conservative provisional scope choice, not an assertion that the ISO standard requires every listed control for CoMind.

## Evidence-state summary

- `REPOSITORY_IMPLEMENTED`: **18**
- `ISOLATED_VERIFIED`: **3**
- `PROPOSED`: **2**
- `GAP`: **15**

## Promotion rule

A row may move toward operating or independently assessed evidence only when cited evidence supports that exact state. A row may move from `PENDING_LICENSED_SOURCE` only after lawful access to the applicable ISO normative source and a controlled review. Neither secondary-source agreement nor a green CI run is sufficient to promote normative status.
