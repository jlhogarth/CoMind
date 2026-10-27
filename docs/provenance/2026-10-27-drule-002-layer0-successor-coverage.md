# DRULE-002 Layer-0 Successor Coverage and Current-Gap Analysis

Date: 2026-10-27
Assessment key: `DRULE-002-SC-001`
Scope: Historical Layer-0 Sections 1 through 28
Environment: CoMind Test and repository evidence only
Issue: #185, DRULE-002 Rule Archaeology and Reconciliation Pipeline

## Purpose

This checkpoint answers a different question from source archaeology.

For every historical Layer-0 Section 1 through 28, the original 2025 substantive clause text remains unrecovered. That historical-source fact is preserved unchanged. This review asks whether current CoMind governance now covers the control family that the historical section title identifies.

The assessment deliberately separates three states:

1. `modern_coverage_adequate`: current approved or active CoMind controls materially cover the section's core control family. This does not mean every implementation is deployed or independently assessed.
2. `modern_coverage_partial`: current governance recognizes and partly controls the family, but material scope, approval, enforcement, applicability, or evidence remains incomplete.
3. `modern_governance_gap`: current evidence identifies a material control need, but CoMind lacks a sufficient canonical present-day control contract for the core family.

None of these states reconstructs the missing 2025 text. None activates a historical rule. None closes archaeology for Sections 1 through 28.

## Result

- Modern coverage adequate: 16 sections.
- Modern coverage partial: 9 sections.
- Genuine current governance gap: 3 sections.
- Historical original-text gap preserved: 28 of 28 sections.
- Archaeology status preserved as `in_progress`: 28 of 28 sections.
- Rule activation caused by this checkpoint: none.
- Candidate promotion caused by this checkpoint: none.

## Section-by-section matrix

| Section | Historical control family | Successor state | Current basis | Material remaining work |
| ---: | --- | --- | --- | --- |
| 1 | Constitutional & Priority | Adequate | C0-C4/T0-T3 authority and governance, fail-closed classification, human authority, epistemic gates | Reconcile historical terminology and lineage without creating a duplicate constitutional layer. |
| 2 | Identity, Roles & Access Control | Adequate | Current authority boundaries, Foundry grants, least-privilege design, human accountability | Keep lower-authority clinical-role and self-escalation proposals scoped until separately justified. |
| 3 | Data Classification & Tagging | **Current governance gap** | AIMS scope recognizes classification, but the provisional applicability view records gaps in data sensitivity, allowed use, requirements, and labeling governance | Approve a canonical classification/tagging and handling contract tied to access, retention, transfer, deletion, logging, and enforcement. |
| 4 | Secrets, Keys & Cryptography | Partial | `RULE-SEC-001` protects raw secrets; provider architecture defines a secret-management boundary | Add key lifecycle, inventory, rotation, compromise, recovery, algorithm/baseline, and retirement governance. |
| 5 | Memory Write / Consolidation | Adequate | `RULE-MEM-004`, `RULE-MEM-005`, promoted historical approval lineage | Continue implementation proof; no duplicate global Layer-0 memory-write rule needed. |
| 6 | Memory Retrieval | Partial | Governed/private retrieval patterns exist, but general requester-scope enforcement remains an unpromoted candidate | Establish one canonical retrieval authorization rule across memory, history, research, and connectors. |
| 7 | Episodic Edit & Selective Forget | Partial | Correction/invalidation lineage and soft-delete candidate exist | Resolve privacy, lawful deletion, evidence retention, and audit-preservation precedence. |
| 8 | Contradiction & Conflict Resolution | Adequate | Premise validation, contradiction preservation, competing models, correction history | Map lineage and avoid duplicating epistemic controls. |
| 9 | Provenance & Truth Scoring | Adequate | Provenance, immutable observations, correction lineage, evidence state, confidence, observable evidence | Reconcile integrity-hash specialization only where materially useful. |
| 10 | Compliance / HIPAA, SOC 2, etc. | Partial | AIMS scope, standards applicability register, version governance, certification-claim controls | Determine actual legal/regulatory/contractual applicability by product, market, geography, data, and use case. Do not infer HIPAA, SOC 2, ISO, or other conformity. |
| 11 | Prompt Injection & Exfiltration | Partial | AIMS risk/policy artifacts explicitly cover prompt/goal hijack and sensitive disclosure; controlled evidence matrix rates prompt/output and agentic security as partial | Approve cross-system trust-boundary rules and complete adversarial tests and traceable mitigations. |
| 12 | Agent Orchestration & Tool Use | Adequate | Explicit identity/capability/task authority, bounded deliberation, terminal dispositions, cross-domain coordination | Continue implementation and operating evidence. |
| 13 | Network & Egress Control | **Current governance gap** | Component network controls exist, but no canonical cross-system egress/information-flow contract; AIMS environment governance remains a gap | Define destination authorization, service identity, outbound transfer policy, sensitive-data flow rules, logging, exceptions, fail behavior, and tests. |
| 14 | Storage, Backups & Recovery | Adequate | Rollback/recovery authority, continuity controls, resilience patterns, backup tooling | Keep restoration and recovery proof system-specific; repository configuration is not operating evidence. |
| 15 | Break-Glass & Overrides | Partial | Founder override and fail-closed ambiguity controls exist | Formalize emergency identity/privilege, reason, time bound, review, revocation, and post-event evidence. |
| 16 | Versioning, Change-Control & Testing | Adequate | Transactional/idempotent migration rules, Test-first validation, verification, executed-evidence gate, source reconciliation | Continue exact-head and deployment evidence. |
| 17 | Multi-Tenancy & Isolation | **Current governance gap** | Cross-tenant leakage is a registered risk; tenant-session enforcement remains outstanding; AIMS evidence records broad database-access/RLS weakness | Define end-to-end tenant/project identity propagation, isolation, service exceptions, negative tests, and deployment verification. |
| 18 | Telemetry, Metrics & Alerts | Adequate | Visible delegated work, durable status, anomaly-monitoring direction, terminal conditions, AIMS isolated monitoring evidence | Reconcile Auto-Watch coverage and naming without duplicating module observability. |
| 19 | Export, Portability & Data Residency | Partial | Continuity covers export/restoration/migration/successor handoff | Add residency, jurisdiction, transfer-location, and exception governance when applicability is known. |
| 20 | IP, Licensing & Third-Party Code | Adequate | Exact/transitive license review, escalation, version-specific exceptions, non-code artifact review, proprietary-IP controls | Maintain evidence and supplier/version linkage. |
| 21 | Supply Chain & Dependency Security | Adequate | Inventory/scanning, blocking/escalation, license drift, commercialization diligence | Extend consistently to models, datasets, plugins, and non-code suppliers as material. |
| 22 | Reasoning Governance | Adequate | Epistemic and RPDA controls plus Helper Matrix/SEAL/causal work cover premise, evidence, revision, purpose lineage, and object separation | Preserve lineage without restoring obsolete mechanisms as authority. |
| 23 | Temporal & Identity Consistency | Adequate | Temporal validity, drift, terminology mapping, correction history, stable/evolvable contracts | Continue implementation-specific temporal/identity proof. |
| 24 | Fairness, Bias & Sensitive Use | Partial | Proportional governance, human accountability, risk-impact structure, fairness/human-rights flags | Individual/group impact controls remain proposed; data preparation/labeling/bias governance remains incomplete. |
| 25 | Error Handling, Rate Limits & Resilience | Adequate | Bounded retries, failure classes, recovery paths, stopping conditions, visible degradation, economic/resource boundaries | Reconcile reusable global resilience rule without hard-coding service-specific thresholds. |
| 26 | Content Controls & Misinformation Defense | Adequate | Multi-source verification, premise validation, uncertainty discipline, abstention under inadequate verification | Keep under Epistemic Integrity rather than creating a competing truth authority. |
| 27 | Research, Logging & Privacy | Partial | Research write-through, provenance, archive candidates, audit minimization | Unify privacy classification, minimization, retention, legal hold, disposal, and deletion with evidence/logging obligations. |
| 28 | Governance, Ownership & Accountability | Adequate | Human authority, policy-versus-enforcement separation, scoped ownership, evidence states, Foundry/AIMS accountability | Maintain named human ownership and operating evidence as governance matures. |

## Why Section 11 is partial, not a genuine gap

The initial hypothesis treated prompt injection/exfiltration as a likely current gap because the Durable RuleBook does not yet contain a dedicated active prompt-injection rule. Current controlled evidence is more complete than that hypothesis.

`docs/governance/iso/AIMS-RISK-AND-IMPACT-REGISTER.md` explicitly includes goal/instruction hijack, prompt injection, sensitive disclosure, privilege abuse, tool misuse, and cross-tenant leakage. `docs/governance/iso/AIMS-AI-POLICY-DRAFT.md` requires testing prompt-injection and misuse scenarios before expanding autonomy. Most decisively, `docs/governance/iso/AIMS-CONTROL-EVIDENCE-MATRIX.md` already rates "Prompt/output and agentic security" as `PARTIAL`, citing fail-closed broker patterns while noting incomplete threat-model, red-team, and mitigation evidence.

The successor classification therefore follows the controlled evidence state: partial coverage, not no coverage.

## Genuine current gaps opened for reconciliation

### Section 3: Data Classification & Tagging

Case: `RC-L0-GAP-DCLASS-001`
Severity: high

The AIMS scope includes data classification, but the provisional Statement of Applicability records gaps for governing data resources, sensitivity and allowed use, data requirements, and labeling/bias preparation. CoMind currently lacks one canonical classification taxonomy or attribute model that drives handling behavior.

Relevant external baseline: NIST SP 800-60 Rev. 2 Initial Working Draft describes categorizing information and systems by confidentiality, integrity, availability, and impact. It is draft guidance, not a CoMind requirement and not a final standard. Source: https://csrc.nist.gov/pubs/sp/800/60/r2/iwd

### Section 13: Network & Egress Control

Case: `RC-L0-GAP-EGRESS-001`
Severity: high

CoMind has component-specific network and service configurations, but no common rule currently governs outbound destinations, information-flow restrictions, service identity, sensitive-data transfer, provider/connector egress, exception handling, and evidence across systems.

Relevant external baselines:

- NIST SP 800-207 Zero Trust Architecture: https://csrc.nist.gov/pubs/sp/800/207/final
- NIST SP 800-207A application/service identity and granular policy: https://csrc.nist.gov/pubs/sp/800/207/a/final
- NIST SP 800-53 Rev. 5 Access Control, including AC-4 Information Flow Enforcement: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final

These sources support the control family. They do not make their specific implementation requirements automatically binding on CoMind.

### Section 17: Multi-Tenancy & Isolation

Case: `RC-L0-GAP-TENANCY-001`
Severity: critical

CoMind already recognizes cross-tenant/project leakage as a material risk. The repository also retains tenant-session enforcement as an outstanding critical item, while current AIMS evidence records broad database access and RLS weaknesses in the observed live baseline. This is a genuine cross-system governance gap, not merely a missing Layer-0 paragraph.

This checkpoint does not modify current RLS, grants, tenant models, production databases, or another lane's security work. It records the gap and the required end-to-end acceptance shape so the owning implementation lane can close it without losing RuleBook lineage.

## Important partial-control findings

### Secrets, keys, and cryptography

`RULE-SEC-001` and provider architecture establish meaningful secret handling, but key lifecycle governance is not complete. NIST SP 800-57 Part 1 Rev. 5 remains the final NIST key-management recommendation while Revision 6 is an initial public draft. A future CoMind security control should cover key inventory, protection, rotation, compromise, recovery, and retirement without copying government-specific requirements that do not apply. Sources:

- https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final
- https://csrc.nist.gov/pubs/sp/800/57/pt1/r6/ipd

### Prompt injection and sensitive disclosure

OWASP's current 2025 LLM guidance treats prompt injection and sensitive-information disclosure as distinct risks. Its mitigations emphasize separating untrusted content, least privilege, human approval for high-risk actions, access control, restricting data sources, and adversarial testing. These recommendations align with CoMind's existing AIMS direction and help define the remaining proof burden, but they are not themselves CoMind authority. Sources:

- https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/

### Compliance and legal applicability

The current `STANDARDS-APPLICABILITY-REGISTER.md` appropriately distinguishes standards selection from conformity and keeps ISO/IEC clause-level mapping pending lawful normative access. It also leaves actual legal/regulatory applicability for eventual markets, geographies, and health-related uses open. That is the correct state. Layer-0's generic "HIPAA, SOC2, etc." heading must not be converted into a claim that any named framework currently applies or is satisfied.

## Durable Test changes

The Test RuleBook archaeology queue now stores `successor_coverage_2026_10_27` metadata on all 28 Sections 1 through 28 with:

- assessment key `DRULE-002-SC-001`;
- one of the three successor states;
- rationale;
- evidence references;
- next action;
- explicit preservation of `original_clause_text_missing`;
- explicit statement that archaeology status is unchanged.

Three open reconciliation cases were added for the genuine present-day gaps. They use `gap_dimension = modern_governance_control` and explicitly record that the historical source gap remains separate.

## Verification result

Post-write Test verification returned:

- 28 queue rows in scope;
- 28 `in_progress` archaeology rows;
- 0 non-null completion timestamps;
- 28 preserved original-text-missing states;
- 28 successor assessments;
- adequate Sections: `1,2,5,8,9,12,14,16,18,20,21,22,23,25,26,28`;
- partial Sections: `4,6,7,10,11,15,19,24,27`;
- current-gap Sections: `3,13,17`;
- three open current-governance reconciliation cases;
- no canonical rule activation from this assessment;
- no candidate promotion from this assessment.

## Recommended next sequence

1. Keep Issue #185 open. Sections 1 through 28 still have unrecovered original clause text, so successor classification does not by itself make archaeology complete.
2. Resolve the three current gaps through explicit present-day specifications, not reconstructed Layer-0 prose.
3. Start with Section 3 data classification because classification attributes should feed privacy, retention, egress, evidence handling, compliance applicability, and tenant isolation semantics.
4. Route Section 17 implementation into the lane that owns database/RLS and tenancy hardening. DRULE-002 should preserve the control contract and evidence requirements without making competing RLS changes.
5. Specify Section 13 network/egress governance after the data-classification vocabulary is stable enough to express what may leave which boundary and under whose authority.
6. Then work the nine partial sections in risk/dependency order: prompt/exfiltration, keys/crypto, break-glass, privacy/logging, retrieval, selective forgetting, compliance applicability, data residency, fairness/sensitive use.
7. Only after each current gap/partial family has a durable disposition should DRULE-002 define a terminal archaeology status for Sections 1 through 28 such as "original text unrecovered; successor coverage classified." That status must not imply verbatim recovery or historical activation.

## Guardrails preserved

- No production mutation.
- No schema change.
- No RLS or grant change.
- No current authority expansion.
- No historical rule activation.
- No candidate promotion.
- No invented Layer-0 prose.
- No certification or regulatory-compliance claim.
- Current external standards are evidence inputs, not self-executing CoMind authority.
