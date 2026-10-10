# CoMind AIMS / ISO Governance Index

Date: 2026-10-10
Status: GOV-001 foundation. Documentation/evidence architecture only.

## Current artifacts

1. `AIMS-SCOPE-DRAFT.md` — proposed organizational/technical AIMS boundary, exclusions, objectives and approval gates.
2. `AIMS-CONTEXT-AND-INTERESTED-PARTIES.md` — internal/external context, interested parties and applicability triggers.
3. `AIMS-AI-POLICY-DRAFT.md` — draft responsible AI management policy for formal management approval.
4. `STANDARDS-APPLICABILITY-REGISTER.md` — exact framework/version metadata, authoritative public sources, applicability and change-control rules.
5. `AIMS-CONTROL-EVIDENCE-MATRIX.md` — evidence-state vocabulary and initial control/gap inventory.
6. `AIMS-RESPONSIBILITY-MATRIX.md` — human accountability, delegated execution and ISO VE separation-of-duties boundaries.
7. `AIMS-DECISION-REGISTER.md` — open management decisions, safe containment assumptions and hard-stop boundaries.
8. `ISO-VE-SHADOW-MODE-CONTRACT.md` — proposed read-only Compliance and Standards Officer operating contract.
9. `AIMS-RISK-AND-IMPACT-REGISTER.md` — minimum risk/impact record and assessment triggers.
10. `AIMS-INITIAL-RISK-REGISTER-2026-10-10.md` — initial evidence-backed AIMS risks and treatment sequencing.
11. `AIMS-AI-SYSTEM-AND-SUPPLIER-INVENTORY.md` — AI system, model/tool and supplier inventory contract.
12. `AIMS-OBJECTIVES-AND-METRICS.md` — initial measurable AIMS objectives and anti-gaming rules.
13. `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` — internal audit, corrective action, management review and operating cadence.
14. `AIMS-COMPETENCE-COMMUNICATION-AND-DOCUMENT-CONTROL.md` — competence, awareness, communication, document states and evidence integrity.
15. `LIVE-READ-ONLY-EVIDENCE-2026-10-10.md` — verified live Supabase baseline captured without mutation.

Related artifacts:

- `../GOV-001-standards-and-ve-baseline.md`
- `../../roadmap/virtual-employee-management-dashboard.md`
- repository root `AGENTS.md`

## Evidence-state principle

Documentation is not operating evidence. Repository implementation is not deployment. Deployment is not verified effectiveness. Historical test evidence does not automatically prove a later commit or current production state.

## Verified live baseline

The 2026-10-10 read-only Supabase inspection verified that live CoMind remains on the initial database/PM-ledger migration set and has not received the repository Foundry/security hardening. Specifically, 75 of 79 `comind` tables have RLS disabled, broad unconditional policies remain on the four RLS-enabled content tables, seven mutable function-search-path findings remain, later Foundry/budget-binding tables are absent, and live `cm_agent` contains no rows.

This does **not** authorize remediation in GOV-001. It establishes a controlled baseline and a production-autonomy blocker for a future dedicated hardening milestone.

## Current non-interference boundary

GOV-001 intentionally avoids modifying active parallel implementation files. Current post-merge state:

- PR #84, ACP durable continuity, remains open and separately evaluated.
- PR #86, Foundry work-lease kernel, has merged as repository/isolated evidence but is not live deployed evidence.
- Interactive Runtime Performance baseline 008 has merged through PR #96 and is now trigger-driven monitoring, not an active GOV-001 dependency or a reason to add more instrumentation.

Runtime hooks, database schema for AIMS records, instantiated ISO agent identity/grants, scheduled surveillance, production evidence ingestion and connector integrations are deferred until those dependencies are reconciled and separately authorized.

## Open management decisions

`AIMS-DECISION-REGISTER.md` is the authoritative GOV-001 list of management decisions. The key current decisions are: designate the accountable AIMS management owner; confirm legal/certification scope; decide ISO/IEC 27001's role; obtain lawful ISO/IEC 42001 normative-text access; approve the AI policy/objectives; assign human risk/control/audit owners; and later separately authorize ISO VE activation and live database hardening.

## Next implementation sequence after GOV-001 foundation

1. **Completed for baseline:** validate current live/read-only security and initial agent/module state without production mutation. Re-run after any authorized hardening.
2. Obtain lawful access to normative ISO text and build a clause-level applicability/control crosswalk without copying prohibited text.
3. Formally assign human management, risk, control and audit responsibilities and approve policy/scope.
4. **Started:** initial evidence-backed risk register exists; populate complete AI system/supplier inventory and assign owners/treatments.
5. Approve measurable AIMS objectives/targets after baselines are available and conduct the first management review.
6. Create a separate isolated implementation issue for ISO shadow VE identity/grants/read-only evidence access.
7. Add automated governance checks only after compatibility and performance review with Foundry/ACP/runtime-performance work.
8. Open a separate live database readiness/hardening milestone after parallel dependencies are reconciled; calculate migration delta, validate isolated, then seek explicit production authority.
9. Accumulate operating evidence before any certification-readiness claim.

## Claim boundary

These artifacts do not establish ISO/IEC 42001 certification or conformity. They create the management-system architecture and evidence discipline needed to pursue that objective honestly.
