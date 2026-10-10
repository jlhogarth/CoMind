# CoMind AIMS / ISO Governance Index

Date: 2026-10-10
Status: GOV-001 foundation accepted; GOV-002 provisional crosswalk/readiness layer in progress.

## Foundation artifacts

1. `AIMS-SCOPE-DRAFT.md` — organizational/technical AIMS boundary, exclusions, objectives and approval gates.
2. `AIMS-CONTEXT-AND-INTERESTED-PARTIES.md` — internal/external context, interested parties and applicability triggers.
3. `AIMS-AI-POLICY-DRAFT.md` — draft responsible AI management policy for formal management approval.
4. `STANDARDS-APPLICABILITY-REGISTER.md` — framework/version metadata, authoritative public sources, applicability and change-control rules.
5. `AIMS-CONTROL-EVIDENCE-MATRIX.md` — evidence-state vocabulary and initial control/gap inventory.
6. `AIMS-RESPONSIBILITY-MATRIX.md` — human accountability, delegated execution and ISO VE separation-of-duties boundaries.
7. `AIMS-DECISION-REGISTER.md` — management decisions, containment assumptions and hard-stop boundaries.
8. `ISO-VE-SHADOW-MODE-CONTRACT.md` — proposed read-only Compliance and Standards Officer operating contract.
9. `AIMS-RISK-AND-IMPACT-REGISTER.md` — minimum risk/impact record and assessment triggers.
10. `AIMS-INITIAL-RISK-REGISTER-2026-10-10.md` — initial evidence-backed AIMS risks and treatment sequencing.
11. `AIMS-AI-SYSTEM-AND-SUPPLIER-INVENTORY.md` — AI system, model/tool and supplier inventory contract.
12. `AIMS-OBJECTIVES-AND-METRICS.md` — measurable AIMS objectives and anti-gaming rules.
13. `AIMS-AUDIT-REVIEW-CORRECTIVE-ACTION.md` — internal audit, corrective action, management review and operating cadence.
14. `AIMS-COMPETENCE-COMMUNICATION-AND-DOCUMENT-CONTROL.md` — competence, awareness, communication, document states and evidence integrity.
15. `LIVE-READ-ONLY-EVIDENCE-2026-10-10.md` — verified live Supabase baseline captured without mutation.

## GOV-002 provisional readiness artifacts

16. `GOV-002-SOURCE-PROVENANCE.md` — source hierarchy, pinned toolkit commit, MIT notice, funding gate and normative-text boundary.
17. `aims-provisional-crosswalk.csv` — machine-readable 38-control provisional SoA/cross-framework/evidence source of truth.
18. `AIMS-STATEMENT-OF-APPLICABILITY-PROVISIONAL.md` — human-readable projection of the machine source.
19. `AIMS-PROVISIONAL-GAP-ASSESSMENT.md` — management-system family and Annex A evidence-gap assessment.
20. `../../../scripts/validate_aims_provisional_crosswalk.py` — deterministic no-network validator for control completeness, source pinning, evidence references and human/machine consistency.

Related artifacts:

- `../GOV-001-standards-and-ve-baseline.md`
- `../../roadmap/virtual-employee-management-dashboard.md`
- repository root `AGENTS.md`

## Evidence-state principle

Documentation is not operating evidence. Repository implementation is not deployment. Deployment is not verified effectiveness. Historical test evidence does not automatically prove a later commit or current production state.

GOV-002 does not replace this vocabulary with a percentage score. Its machine-readable crosswalk preserves the exact observed CoMind evidence state for each provisional control.

## Secondary-source rule

The pinned `Ankit-Uniyal/iso-42001-ai-governance-toolkit` repository is an approved **secondary** implementation/mapping source at commit `803b62da4c66f6b6ab601c87cb298597a497eebd`.

Its structure and candidate mappings accelerate CoMind work, but they are not ISO normative evidence. CoMind uses independently written control objectives/rationales and preserves `PENDING_LICENSED_SOURCE` for ISO-specific normative verification.

AIRiskAssess may later supplement the crosswalk if an export can be captured with adequate provenance/version metadata. It is not required for GOV-002 acceptance.

## Funding gate

Paid ISO normative material and external certification-body work remain deferred until CoMind has funding. Free/public NIST, OWASP, MITRE and EU sources can continue to support their own mappings and technical controls in the meantime.

This funding gate does not prevent CoMind from building its AIMS, inventories, risk/impact processes, evidence discipline, internal control design or operating records.

## Verified live baseline

The 2026-10-10 read-only Supabase inspection found that repository Foundry/security hardening was not deployed live: 75 of 79 `comind` tables had RLS disabled, broad unconditional policies remained on the four RLS-enabled content tables, seven mutable function-search-path findings remained, later Foundry/budget-binding tables were absent, and live `cm_agent` contained no rows.

That evidence remains a production-autonomy blocker until superseded by a newer controlled observation after an authorized hardening milestone.

## Current non-interference boundary

GOV-002 is documentation plus isolated validation. It does not mutate Supabase, add database migrations, activate the ISO VE, alter provider/runtime behavior, or use paid services.

At GOV-002 creation, the remaining open parallel implementation PRs were #84 (ACP durable continuity) and #86 (Foundry work-lease kernel). GOV-002 does not modify their implementation files.

## Current provisional picture

The GOV-002 SoA currently represents 38 Annex A control identifiers: 37 provisionally applicable and one (`A.10.4`) undetermined pending the final customer/commercial certification boundary.

Evidence is intentionally conservative rather than optimized for a compliance score: repository design, isolated verification, proposed work and explicit gaps remain distinct. Every ISO-specific row remains pending licensed normative review.

## Next treatment sequence

1. Complete controlled AI-system, data, tool and supplier inventories.
2. Create system-specific intended-use, risk and impact records for the first deployable capability set.
3. Resolve the live database security/readiness blocker in a separate authorized lane.
4. Establish competence, incident communication, retention and supplier-governance operating evidence.
5. Conduct the first controlled AIMS management review once sufficient operating evidence exists.
6. After funding, obtain lawful ISO/IEC 42001 normative access and reconcile every provisional row before any conformity-readiness assertion.

## Claim boundary

These artifacts do not establish ISO/IEC 42001 certification, conformity, clause-complete verification, or auditor acceptance. They create a controlled provisional implementation/evidence map that can later be reconciled against lawful normative access without discarding current engineering work.
