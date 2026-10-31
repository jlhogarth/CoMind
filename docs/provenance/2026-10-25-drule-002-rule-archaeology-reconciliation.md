# DRULE-002 Rule Archaeology and Reconciliation Evidence

Date: 2026-10-25  
Issue: #185  
Branch: `drule-002-rule-archaeology-reconciliation`  
Environment: CoMind Test / private `comind_pm` schema  
Production: unchanged and not authorized by this work

## Purpose

DRULE-002 turns the Durable Rulebook into a governed reconciliation system. Historical text, founder instructions, current policy, implementation evidence, and operational proof remain distinct authority and evidence states.

Core rule: discovery does not equal activation.

## Live Test schema

The live Test database contains:

- `pm_rules`
- `pm_rule_versions`
- `pm_rule_sources`
- `pm_rule_event_links`
- `pm_rule_source_documents`
- `pm_rule_candidates`
- `pm_rule_relationships`
- `pm_rule_reconciliation_cases`
- `pm_rule_reconciliation_members`
- `pm_rule_archaeology_queue`

Current projections:

- `v_durable_rulebook`
- `v_rule_reconciliation_queue`
- `v_rule_candidate_review_queue`
- `v_rule_archaeology_queue`

All Rulebook and DRULE-002 tables have RLS enabled. `anon`, `authenticated`, and `PUBLIC` have no table grants. `service_role` is the governed private access path.

## Current capture state

The canonical CoMind project currently contains:

- 157 normalized rules
- 157 current rule versions
- 157 direct rule-source links
- 68 source documents in the source census
- 44 rule candidates
- 1 promoted candidate
- 10 typed rule relationships, 8 confirmed
- 19 reconciliation cases, 18 open and 1 resolved
- 32 Layer-0 archaeology queue entries
- 28 Layer-0 sections still open for original clause recovery
- 4 Layer-0 sections partially reconstructed from surviving clause text

Current rule lifecycle distribution:

- 101 Active
- 5 Approved
- 31 Specified
- 7 Proposed
- 13 Historical Candidate

## Important archaeology recoveries

Direct founder or explicit CoMind-rule evidence has now recovered and normalized several historically important rule families:

- Balance in Complexity, including explicit founder override authority
- ThreadKeeper Memory Handler: no autonomous or silent durable memory edits and inspectable approve/edit/reject disposition
- Never promise an action you do not perform
- Infinitum structural preservation and recurring continuity snapshots
- Acronym Transparency, including first-use expansion, visible self-correction, and opportunistic legacy retrofit
- Safe Creation Defaults
- Execution & Transparency
- Core Rule of System Evolution
- Forward Reasoning
- Observable Evidence Rule
- milestone closeout and continuation handoff
- intervention only when founder action is genuinely required, with safe reversible workarounds otherwise
- visible development communication
- Development Continuance Rule
- one active implementation lane by default
- Handoff = Yes as an evidence-backed Foundry readiness gate
- selected planning becomes one GitHub implementation issue before code
- free deterministic verification before paid/provider calls
- direct action links when Joseph must act in another application
- the operational meaning of `Continue`
- Secret-classified CoMind IP non-disclosure
- separation of personal continuity from CoMind project decisions
- version archaeology relationship classification
- the founder-approved CoMind PDF presentation standard
- approved software supply-chain controls from the Open Source Sourcing and IP Protection Policy

Ten Ranked Preference Decision Architecture frozen invariants are captured as `specified` successor evidence rather than silently promoted into active enterprise policy.

Conversation archaeology distinguishes founder-approved instructions from assistant-proposed historical suggestions through source authority and authority-confidence fields.

## Artifact census findings

The artifact sweep now includes the historical XML ruleset and AI Control Code V1.

The XML ruleset contains genuine clause-level rules covering code style, response format, PDF presentation, self-review, testing, tool-call budgeting, caching, and fallback behavior. Several are clearly context-bound, such as functional-components-only, Jest-per-function, and a three-tool-call maximum. These are stored as historical candidates with low or mixed authority rather than activated simply because they appear inside a `<ruleset>` artifact.

The dark and light HTML XML exports contain the same clause set with presentation differences and are stored as separate source artifacts without double-counting the rules.

AI Control Code V1 is stored as a mixed-authority control artifact. Founder approval is directly established for the compact no-space syntax and broad V1 concept, while several persistence/default semantics remain artifact-authored candidates until independently corroborated.

## Layer-0 recovery state

The recovered `CoMind Layer-0 (ILP) Rulebook v2` is dated 2025-08-30 and identifies 32 domains.

The surviving readable artifact preserves the complete section taxonomy, but substantive clause text is directly available only for:

- Section 29: Service Level Agreements
- Section 30: Interoperability and Standards
- Section 31: Cost and Resource Governance
- Section 32: Emerging / Forward Controls

Sections 1 through 28 therefore remain explicit source-recovery gaps. Their headings prove the domains existed; they do not prove the missing clause wording.

Founder conversation evidence separately confirms that the Layer-0 expansion was intended to be comprehensive, that SLA/interoperability/cost governance were explicitly added, that SLA timing received a 40 percent pad, that exact budget numbers were deferred while line-item cost controls remained required, and that additional top-shelf forward controls were authorized.

Later architecture is recorded as successor evidence without being misrepresented as verbatim recovery of 2025 wording. Examples include RPDA invariants around immutable raw evidence, append-only correction, provenance-bearing inference, separation of prediction/recommendation/decision/authorization, and lineage-aware invalidation.

Individual assistant-proposed historical rule examples remain lower-authority candidates until corroborated by founder approval, a final artifact, later canonical policy, or implementation evidence.

## Reconciliation state

The first reconciliation case has been resolved: historical explicit memory approval is represented by active `RULE-MEM-004` and `RULE-MEM-005`, linked to the broader modern memory-promotion rules through confirmed specialization/support relationships.

Open reconciliation families include:

- historical Layer-0 budget and cost semantics versus current FinOps
- historical Layer-0 constitutional priority versus modern authority/governance architecture
- synthetic/test data versus current evidence-state rules
- immutable raw archive and parse-before-promotion requirements
- affective context versus evidence-led reasoning
- historical SLA padding versus a future current service-level policy
- historical production-ready-only language versus staged Test-first maturity
- soft deletion versus modern privacy, erasure, invalidation, and audit retention
- system-wide anomaly Auto-Watch versus current observability architecture
- migration source-of-truth audit versus canonical evidence/conflict preservation
- historical resilience mechanisms versus a reusable modern resilience contract
- Infinitum weekly cadence versus continuous evidence capture
- Clarification Persistence versus safe reversible autonomy
- historical `CoMind AI` filename prefix versus CDES durable identity
- historical Replit bundle behavior versus Git/reproducible builds
- options-before-build versus current proactive artifact creation
- filename reuse/anti-version-sprawl versus CDES version lineage

No unresolved case is silently resolved by recency.

## Repository parity

This branch adds exactly five DRULE-002 files:

- `db/migrations/20261025_012_durable_rulebook_registry.sql`
- `db/migrations/20261025_013_drule_002_rule_archaeology_reconciliation.sql`
- `db/sql/20261025_drule_002_layer0_archaeology_seed.sql`
- `db/verification/20261025_drule_002_rule_archaeology_reconciliation_verification.sql`
- this provenance record

Migration numbering was reconciled twice as concurrent conversational-continuity work advanced on `main`. DRULE originally used `002` and `003`, then moved to `005` and `006`. Current CFR work now owns `20261025_001` through `20261025_011`, including `005` and `006`, so the final DRULE repository identities are `012` and `013`. The SQL bodies are unchanged by this renumbering.

The repository migration is intentionally cleaner than the live construction sequence. Two intermediate relational defects were detected and repaired during live implementation:

1. The first reconciliation-member primary key shape incorrectly forced both optional member references non-null.
2. Dropping that composite key did not remove the inherited `NOT NULL` flags.

The repository version directly models `pm_rule_reconciliation_members` with its own UUID primary key, nullable `rule_id` / `candidate_id`, an XOR check, and partial uniqueness indexes.

Before merge, the branch is refreshed onto the then-current `main` with a two-parent merge commit rather than a force update, and the PR diff is reverified to remain exactly five DRULE-002 files.

## Verification

Live Test verification established:

- all required tables and projections exist
- all governed tables have RLS enabled
- service-role access exists
- no client/public table grants exist
- reconciliation member rule/candidate columns are nullable
- XOR membership semantics are present
- partial uniqueness indexes exist
- current Rulebook rows have matching versions and provenance links

The Layer-0 seed was replayed idempotently against Test.

A paid Supabase development branch was considered for repository replay but required a fresh cost-confirmation flow. DRULE-002 therefore used a zero-recurring-cost schema-isolated replay inside the Test project. The replay created a temporary `comind_drule002_replay` schema, recreated the corrected rule/reconciliation contracts, inserted both rule-backed and candidate-backed reconciliation members plus archaeology seed data, asserted RLS/nullability/XOR behavior, and dropped the scratch schema in the same successful migration. Production remained unchanged.

## Known remaining work

- Recover substantive original Layer-0 clause text for sections 1 through 28 from conversations, exports, alternate files, historical code, and later documents.
- Continue reconciling historical rules against current accepted architecture instead of blindly reactivating them.
- Expand reproducible seeding/snapshot support beyond the initial Layer-0 archaeology set.
- Expand typed predecessor, successor, equivalence, specialization, conflict, and supersession relationships.
- Define the activation-review gate so only approved authority can move candidates into active rule versions.
- Add deterministic lifecycle-gate evaluation for machine-checkable rules.
- Connect Rulebook identifiers into CDES / EDG relationships without creating a second authority store.

## Authority

Founder authorization for this phase was granted 2026-10-25. Existing production, C4, and stronger security controls remain in force.
