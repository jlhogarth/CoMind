# CoMind AIMS / ISO Governance Index

Date: 2026-10-10
Status: GOV-001 foundation. Documentation/evidence architecture only.

## Current artifacts

1. `AIMS-SCOPE-DRAFT.md` — proposed organizational/technical AIMS boundary, exclusions, objectives and approval gates.
2. `STANDARDS-APPLICABILITY-REGISTER.md` — exact framework/version metadata, authoritative public sources, applicability and change-control rules.
3. `AIMS-CONTROL-EVIDENCE-MATRIX.md` — evidence-state vocabulary and initial control/gap inventory.
4. `ISO-VE-SHADOW-MODE-CONTRACT.md` — proposed read-only Compliance and Standards Officer operating contract.
5. `AIMS-RISK-AND-IMPACT-REGISTER.md` — minimum risk/impact record and assessment triggers.
6. `AIMS-AI-SYSTEM-AND-SUPPLIER-INVENTORY.md` — AI system, model/tool and supplier inventory contract.
7. `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` — internal audit, corrective action, management review and operating cadence.

Related artifacts:

- `../GOV-001-standards-and-ve-baseline.md`
- `../../roadmap/virtual-employee-management-dashboard.md`
- repository root `AGENTS.md`

## Evidence-state principle

Documentation is not operating evidence. Repository implementation is not deployment. Deployment is not verified effectiveness. Historical test evidence does not automatically prove a later commit or current production state.

## Current non-interference boundary

GOV-001 intentionally avoids modifying the active parallel implementation files in:

- PR #84, ACP durable continuity;
- PR #86, Foundry work-lease kernel;
- PR #88, interactive runtime performance.

Runtime hooks, database schema for AIMS records, instantiated ISO agent identity/grants, scheduled surveillance, production evidence ingestion and connector integrations are deferred until those dependencies are reconciled and separately authorized.

## Decisions that do not block the present documentation lane

The following require management decisions before later stages but do not prevent GOV-001 from establishing the foundation:

- final legal entity wording and accountable AIMS management owner;
- whether ISO/IEC 27001 certification is a separate objective or supporting framework only;
- target certification boundary/products/services;
- exact markets/geographies and resulting legal/regulatory obligations;
- licensed ISO normative-text access for clause-level mapping;
- future ISO VE connector/data-source permissions;
- retention periods based on legal/contractual requirements.

## Next implementation sequence after GOV-001 foundation

1. Validate the current live/read-only security and AI-system inventory without production mutation.
2. Obtain lawful access to normative ISO text and build a clause-level applicability/control crosswalk without copying prohibited text.
3. Assign human management, risk, control and audit responsibilities.
4. Populate the initial AI system/supplier inventory and risk register.
5. Define AIMS objectives/metrics and first management-review baseline.
6. Create a separate isolated implementation issue for ISO shadow VE identity/grants/read-only evidence access.
7. Add automated governance checks only after compatibility and performance review with Foundry/ACP/runtime-performance work.
8. Accumulate operating evidence before any certification-readiness claim.

## Claim boundary

These artifacts do not establish ISO/IEC 42001 certification or conformity. They create the management-system architecture and evidence discipline needed to pursue that objective honestly.