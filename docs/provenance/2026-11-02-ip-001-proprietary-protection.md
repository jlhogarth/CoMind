# IP-001 proprietary protection checkpoint

Date: November 2, 2026
Issue: https://github.com/jlhogarth/CoMind/issues/511
Branch: `ip-001-proprietary-protection-511`
Baseline: `6420a4f3d0bc50c503a9cd8d44e37c3064baa09d`

## Authority and scope

Joseph directly requested that the proposed IP protections be created in GitHub and properly documented. T2 applies because repository legal-policy publication is consequential. Actor: this IP-001 development lane, using the authenticated GitHub connector. Resources: root LICENSE, README licensing section, docs/legal and this evidence record. No runtime, credential, production, corporate assignment, paid-service or visibility change. No agent delegation.

Read AGENTS.md, Development Environment Contract v1.4 and Continuous Excellence Contract. Relevant internal controls: RULE-IP-001/002/003/004/006/008/009, GOV-DEV-014 forward impact review, evidence and legal human-stop boundaries. No certification or external standards conformity is claimed. Current direct user authority supports preparation; no inferred L4A authority is used to execute an agreement.

## Baseline and collision review

GitHub repository lookup reports public visibility and main as default branch. Root LICENSE fetch returned 404. A full working-tree checkout identified only the root AGENTS.md, no tracked license-named files, two package manifests with private=true, and an existing MIT notice in GOV-002-SOURCE-PROVENANCE.md. The license filename scan across fetched refs produced no LICENSE/LICENCE/COPYING paths. A commit-message search found GOV-002; this is not a complete historical content or external distribution audit. Corporate ownership and human authorship have not been established file by file.

Open PRs and license-related issues were inspected before editing. No overlapping proprietary-license implementation was identified in the returned results. Existing FAB-001 and WSA-001 licensing/domain issues are separate scopes. The change is additive except for a short README insertion. No other lane's implementation or third-party notice is changed.

## Forward impact review

The notice makes rights reservation discoverable without granting new general reuse rights. The proposed agreement would impose obligations only on an accepting recipient under a separately executed authorization. It cannot bind every visitor, revoke valid historical rights, override third-party terms, restore public secrecy or create copyright in unprotectable material. Misleading ownership claims are avoided by referring to actual respective rights holders and recording chain-of-title review as unresolved.

Second-order risks: confusing draft terms with active protection, treating npm private as repository privacy, and assuming AI output is uniformly copyrightable. The README and package explicitly prevent those claims. Third-order risk: distributing a mixed-license release under a blanket proprietary claim; a component carve-out and exact-release review gate address that risk without claiming a completed dependency audit.

Chosen approach: rights reservation plus complete review-draft agreement and acceptable-use terms. No new license grant, signed authorization, liability commitment or invented party. Alternatives rejected: permissive open-source grant contrary to requested protection; blanket ownership assertion; retroactive secrecy claim; immediate executed agreement without identified parties. Runtime overhead is zero; no new dependency or service is introduced.

## Verification and recovery

Local validation before publication: repository no-placeholder scan passed; git diff --check passed. Verify relative links, changed-path boundaries and exact remote content before reporting publication complete. Runtime tests are not applicable to documentation-only changes. CI outcome is reported separately on the PR; workflow existence is not a passing result.

Recovery: abandon the review branch or revert only IP-001 changes after adoption. Reverting repository text does not rescind an independently executed agreement. Preserve prior versions and decisions. No data rollback is necessary.

## Continuity and remaining work

Objective: publish the complete review package and its evidence in one PR linked to issue #511. Preparation is distinct from legal activation. Review blockers and responsible parties are in docs/legal/REVIEW-REGISTER.md. Joseph and counsel must establish the legal parties and approve any actual external authorization. The Development Environment Contract preserves consequential legal/corporate commitments as a human boundary.

This file is repository evidence, not a claimed live Supabase RunBook append. No live RunBook write was performed. No background monitor is running. Resume by reading issue #511, its linked PR, the current main and the review register; do not reconstruct state from a chat success claim.
