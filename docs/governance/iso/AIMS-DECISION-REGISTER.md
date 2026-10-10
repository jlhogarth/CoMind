# CoMind AIMS Management Decision Register

Date: 2026-10-10
Status: Open decision register for GOV-001. An entry is not approved merely because it is documented.

| Decision ID | Decision | Why it matters | Safe current assumption | Authority / status |
| --- | --- | --- | --- | --- |
| AIMS-D001 | Designate the accountable human AIMS management owner | Required for policy/scope approval, risk appetite, management review and resource decisions | Keep all policy/scope artifacts in DRAFT state | Human management decision required |
| AIMS-D002 | Confirm legal entity / organizational certification boundary | Determines who/what a future certification statement could cover | Refer to `CoMind` generically; make no legal-entity certification claim | Human management/legal decision required |
| AIMS-D003 | Decide whether ISO/IEC 27001 certification is an independent objective | Affects ISMS scope, audit/certification workload and control integration | Use ISO/IEC 27001 as supporting security framework only; no certification program assumed | Management decision required before ISMS certification planning |
| AIMS-D004 | Obtain lawful access to ISO/IEC 42001:2023 normative text | Needed for authoritative clause/control completeness and Statement of Applicability work | Use public ISO metadata/informative material only; do not claim clause completeness | Purchase/license/access decision required |
| AIMS-D005 | Confirm products/services in initial AIMS scope | Controls risk inventory, interested parties, legal obligations and certification boundary | Scope CoMind platform/Foundry architecture broadly for design, but do not claim final certification scope | Management product-scope decision required |
| AIMS-D006 | Confirm initial markets/geographies/regulated use cases | Determines legal/privacy/sector obligations | Do not invent regulatory applicability | Business/legal decision required as go-to-market scope firms |
| AIMS-D007 | Approve AI management policy | Converts draft policy into controlled organizational direction | Keep `AIMS-AI-POLICY-DRAFT.md` as DRAFT | Management approval required |
| AIMS-D008 | Approve AIMS objectives and numerical thresholds | Needed for performance evaluation and management review | Keep measurable indicators but do not invent targets; wait for baselines | Management approval after evidence baselines |
| AIMS-D009 | Assign named human risk/control/audit roles | Needed for accountability, risk acceptance and independent review | Use role names only; ISO cannot fill accountability gaps | Management assignment required |
| AIMS-D010 | Authorize ISO VE instantiation and source access | Moves ISO from paper contract to actual shadow-mode agent | No profile, grants, connector access, schedule or runtime activation | Separate implementation authorization required after dependencies reconcile |
| AIMS-D011 | Authorize live database hardening/deployment | Required before repository security/Foundry controls become live | No production mutation; production autonomy remains blocked | Separate C4/production authorization required after migration plan/test evidence |
| AIMS-D012 | Set evidence/data retention periods | Needed for privacy, audit, legal hold, deletion and cost controls | Minimize content and preserve material evidence without committing unsupported durations | Legal/contractual/management input required |
| AIMS-D013 | Set internal audit independence mechanism for a small organization | Prevents self-audit/self-approval | Use independent review where practical and never allow ISO to close its own findings | Management decision before first formal internal audit |

## Decision discipline

- Default assumptions above are containment choices, not approvals.
- Every approved decision should identify approver, authority, date, effective scope and evidence reference.
- A decision changing production authority, security posture, supplier/data access, certification claims or live database state requires the existing higher-level CoMind authorization process in addition to this register.
- ISO may track open decisions and evidence but cannot convert an open decision into an approval.

## Current stop conditions

GOV-001 can continue documentation and evidence verification without resolving every decision above. The following become hard stops for later stages:

- Clause-complete ISO/IEC 42001 mapping: blocked by AIMS-D004.
- Approved operating AIMS policy: blocked by AIMS-D001 and AIMS-D007.
- Formal risk acceptance: blocked by AIMS-D001/AIMS-D009.
- ISO VE activation: blocked by AIMS-D010 plus Foundry dependency reconciliation.
- Production Foundry/security deployment: blocked by AIMS-D011 plus migration/readiness evidence.
- External certification claim: blocked by multiple decisions plus independent certification assessment.