# CoMind Initial AIMS Risk Register

Date: 2026-10-10
Status: Initial evidence-backed management-system risk register for GOV-001. Ratings are qualitative priorities until management approves a formal scoring method.

## Rating note

This document deliberately avoids invented numeric likelihood/impact scores. `Review priority` indicates sequencing urgency based on verified evidence and foreseeable consequence. Formal inherent/residual scoring requires an approved method and human risk ownership.

| Risk ID | Risk | Evidence | Review priority | Current treatment / control | Residual state / next decision |
| --- | --- | --- | --- | --- | --- |
| AIMS-R001 | Production autonomy could rely on database controls that exist only in repository/isolated tests, not in live Supabase | `LIVE-READ-ONLY-EVIDENCE-2026-10-10.md`: 75/79 live tables lack RLS; Foundry tables absent | **Immediate blocker for production VE autonomy** | GOV-001 prohibits treating repository control as deployed; production mutation remains unauthorized | Open. Separate live readiness/hardening milestone required after dependency reconciliation |
| AIMS-R002 | Repository/live schema drift can cause runtime or governance assumptions to be false and deployment ordering to fail | Live migration history contains only base + two PM ledger migrations; later Foundry/FinOps layers absent | High | Evidence-state vocabulary, explicit migration-history baseline, no live deployment in GOV-001 | Open. Calculate exact migration dependency/delta before any production migration |
| AIMS-R003 | Broad database policies could permit access beyond intended least privilege if exposed through applicable roles/APIs | Unconditional `true` policy expressions observed on conversation, message, document and chunk tables | High | Repository security prerequisite removes broad policies in isolated design; no production activation authorized | Open. Determine intended Data API exposure/grants and design scoped RLS before deployment |
| AIMS-R004 | Mutable function search paths create avoidable database security risk | Supabase Security Advisor reports seven `function_search_path_mutable` findings | High | Repository hardening sets fixed search paths; not live | Open. Deploy only through authorized hardening milestone and re-run advisor |
| AIMS-R005 | A future agent could be treated as authorized merely because a design persona or role document exists | Live `cm_agent` count is 0; Foundry profile/capability/authorization tables absent | High before activation | ISO contract distinguishes documented, instantiated, enabled and running states | Open. Instantiation requires separate issue, profile/grants and read-only tests |
| AIMS-R006 | Standards mappings may become stale or falsely precise when frameworks change or normative ISO text is not licensed/available | NIST AI RMF 1.0 is under revision; MITRE ATLAS is living; clause-level ISO mapping not yet performed | Medium/High governance | Controlled standards register with version/source/change triggers; no clause-completeness claim | Open. Obtain lawful normative access and establish surveillance/change approval |
| AIMS-R007 | GOV-001 runtime/database work could conflict with active continuity and work-lease branches, or with the accepted runtime baseline if it adds critical-path hooks | Open PRs #84 and #86 still modify shared runtime/workflow/schema-adjacent surfaces; Interactive Runtime Performance baseline 008 is merged and trigger-driven | High integration | GOV-001 restricted to documentation/evidence; changed-file collision check performed; no new runtime-performance instrumentation in this lane | Controlled for current lane. Reassess before any implementation issue |
| AIMS-R008 | Governance checks could degrade interactive response latency, increase failure paths, or add hidden costs | Baseline 008 is accepted; no governance runtime hooks are enabled yet | Medium/High architecture | Heavy compliance analysis designated asynchronous; runtime hooks deferred; metrics must be compared against baseline 008 | Open. Set accepted performance budgets before critical-path governance hooks |
| AIMS-R009 | CoMind could accidentally overstate certification, compliance, deployment or test status | No certification exists; management system is being established; multiple controls are repository-only | High reputational/governance | Claim boundary in scope/policy; evidence-state vocabulary; ISO cannot self-certify | Open. Add communications/release review if certification program becomes active |
| AIMS-R010 | External model/provider/supplier changes could alter behavior, data handling, security or cost without reassessment | Supplier inventory is not yet populated; provider integrations evolve independently | Medium/High | Supplier inventory contract and change-trigger rules created | Open. Populate suppliers, terms/data flows, contingency and change monitoring |
| AIMS-R011 | Human approval may become a bottleneck or fatigue point as Virtual Employee autonomy grows, weakening meaningful oversight | Foundry authorization design exists, but production operating evidence is absent | Medium/High future autonomy | T0-T3 proportionality, C0-C4 authority, future dashboard approval queue concept | Open. Baseline approval volume/latency and design batching/escalation without weakening authority |
| AIMS-R012 | Persistent memory/evidence may preserve sensitive or incorrect information beyond justified need | CoMind architecture depends on persistent memory/provenance; retention schedule is not yet controlled AIMS evidence | High where sensitive data is involved | Data minimization and evidence-retention principles documented | Open. Define classification, retention, correction, legal hold and deletion governance before sensitive production scope expands |
| AIMS-R013 | Inter-agent deliberation could amplify compromised instructions, create false consensus, or obscure dissent | Repository deliberation controls are isolated-verified; no live agents observed | High before multi-agent autonomy | Silence-not-agreement and dissent-aware isolated protocols documented | Open. Add compromised-agent/collusion/adversarial deliberation scenarios before production council execution |
| AIMS-R014 | Delegated work could disappear silently, leaving uncompleted obligations or false completion assumptions | No-silent-work policy exists; work-lease kernel is still parallel PR #86 | Medium/High operational | Policy plus separate work-lease implementation lane | Open until #86 final-head verification/merge and operating evidence exist |

## Immediate treatment sequence

1. Keep production Virtual Employee autonomy disabled against the current live database.
2. Finish/merge independent parallel runtime dependencies before planning live Foundry hardening.
3. Establish lawful ISO normative-text access and management ownership.
4. Populate the AI system/supplier inventory and assign human risk/control owners.
5. Open a dedicated live database readiness/hardening milestone, not a GOV-001 migration.
6. Build agentic-security and recovery test coverage before expanding authority.
7. Establish approved risk scoring/acceptance method, then convert these priorities into controlled inherent/residual ratings.

## Ownership blocker

Formal risk acceptance cannot occur until a named human AIMS management owner and risk owners are designated. ISO may maintain and report these records but cannot accept the risks.
