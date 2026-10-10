# CoMind AIMS Competence, Communication, and Document Control

Date: 2026-10-10
Status: Draft management-system support process.

## Purpose

Define how CoMind establishes role competence, communicates material AI-governance information, and controls AIMS documents/evidence without converting informal drafts into approved policy.

## Competence

For each AIMS-relevant human or Virtual Employee role, identify the knowledge/skill required to perform delegated work safely and the evidence used to establish competence.

Relevant competence domains include:

- CoMind architecture and authority model;
- AI/system risk and impact assessment;
- secure software/database practices;
- privacy/data classification and minimization;
- Foundry capability grants, authorization and recovery;
- evidence/provenance discipline;
- incident and corrective action;
- supplier/model change assessment;
- relevant standards/frameworks and their edition/version boundaries;
- audit/review independence and evidence evaluation;
- FinOps and resource authority;
- runtime-performance implications of governance;
- communication of uncertainty and unsupported claims.

Competence evidence may include relevant experience, training, demonstrated test/review performance, certification where relevant, supervised practice, or independent evaluation. Merely assigning a role does not prove competence.

## Virtual Employee competence

For a Virtual Employee, competence is not a self-declared capability. It should be supported by:

- versioned role/instruction contract;
- bounded capability grants;
- deterministic and adversarial tests appropriate to the role;
- observed performance and failure history;
- scope/authority limits;
- current model/provider/tool dependencies;
- human oversight and escalation rules;
- evidence of regression verification after material change.

A VE must not infer competence outside its granted scope from general model capability.

## Awareness

People and agents performing AIMS-relevant work should understand, at the level appropriate to their role:

- the AI management policy and objectives;
- their authority and escalation limits;
- the consequences of bypassing controls or overstating evidence;
- how to report incidents, nonconformities and unsupported claims;
- confidentiality/data handling expectations;
- the current distinction between repository, isolated, deployed and operating evidence;
- the obligation to preserve material failure/dissent evidence.

## Communication

Material AIMS communications should identify audience, purpose, owner, source/evidence, confidentiality classification, required action and effective date/version where applicable.

Communication classes include:

1. **Operational:** incidents, authority revocations, outages, control failures, recovery state.
2. **Governance:** policy changes, risk acceptance, exceptions, management decisions, audit findings.
3. **Standards:** framework/version changes and applicability decisions.
4. **Supplier:** material provider/model/tool changes, incidents, terms/data-flow changes.
5. **External assurance:** customer, regulator, auditor or certification communications.
6. **Public claims:** statements about certification, compliance, security, autonomy, model behavior or deployment status.

Public/assurance claims require evidence review proportionate to consequence. ISO may flag an unsupported claim but may not approve the claim itself.

## Document states

Controlled AIMS artifacts should visibly distinguish:

- `DRAFT` — not approved policy/control;
- `APPROVED` — management-approved current controlled document;
- `SUPERSEDED` — retained for history, not current;
- `RETIRED` — no longer applicable but retained according to policy;
- `EVIDENCE RECORD` — observation/result that must not be edited into a different historical outcome.

Repository merge alone does not automatically convert a draft management policy into approved organizational policy unless the approval process explicitly says so.

## Minimum document-control metadata

Where appropriate record:

- document/control ID;
- title;
- owner;
- status;
- version;
- approval authority and approval evidence;
- effective date;
- review date or review trigger;
- applicable scope;
- superseded version/reference;
- related controls/risks/evidence;
- confidentiality/data classification;
- retention/disposal rule.

## Evidence record integrity

Evidence records should be append-only or otherwise protected from silent alteration where material. Corrections should preserve the original observation, correction reason, correcting actor, date and replacement evidence.

Do not paste secrets, credentials, raw sensitive payloads, hidden model reasoning, or proprietary standard text into AIMS documents merely to make an evidence package appear complete.

## Change approval

Material policy or control changes require:

1. identified reason/trigger;
2. affected scope and dependencies;
3. risk/impact review proportionate to change;
4. owner and approval authority;
5. implementation/test/evidence plan;
6. communication to affected roles;
7. version/effective date;
8. post-change verification where applicable.

Technical implementation continues to follow CoMind's one issue -> one branch -> one PR workflow unless explicitly superseded by an approved process.

## Current gaps

- formal competence requirements are not yet assigned to named humans;
- an AIMS training/awareness record does not yet exist;
- management-policy approval mechanism is not yet formally designated;
- external/public assurance review is not yet an operating process;
- retention/classification rules require legal/contractual input before finalization.