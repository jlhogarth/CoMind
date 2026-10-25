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

- 147 normalized rules
- 147 current rule versions
- 147 direct rule-source links
- 53 source documents in the source census
- 27 rule candidates
- 1 promoted candidate
- 10 typed rule relationships, 8 confirmed
- 17 reconciliation cases, 16 open and 1 resolved
- 32 Layer-0 archaeology queue entries
- 28 Layer-0 sections still open for original clause recovery
- 4 Layer-0 sections partially reconstructed from surviving clause text

Current rule lifecycle distribution:

- 88 Active
- 5 Approved
- 34 Specified
- 7 Proposed
- 13 Historical Candidate

## Important archaeology recoveries

Direct founder or explicit CoMind-rule evidence has now recovered and normalized several historically important rule families:

- Balance in Complexity, including explicit founder override authority
- ThreadKeeper Memory Handler: no autonomous or silent durable memory edits and inspectable approve/edit/reject disposition
- Never promise an action you do not perform
- Infinitum structural preservation and recurring continuity snapshots
- Acronym Transparency, including first-use expansion, visible self-correction, and opportunistic legacy retrofit
- Execution & Transparency
- Core Rule of System Evolution
- milestone closeout and continuation handoff
- intervention only when founder action is genuinely required, with safe reversible workarounds otherwise
- visible development communication
- Development Continuance Rule
- one active implementation lane by default
- version archaeology relationship classification
- the founder-approved CoMind PDF presentation standard
- approved software supply-chain controls from the Open Source Sourcing and IP Protection Policy

Ten Ranked Preference Decision Architecture frozen invariants are also captured as `specified` successor evidence rather than being silently promoted into active enterprise policy.

Conversation archaeology distinguishes founder-approved instructions from assistant-proposed historical suggestions through source authority and authority-confidence fields.

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

The first reconciliation case has been resolved: historical explicit memory approval is now represented by active `RULE-MEM-004` and `RULE-MEM-005`, linked to the broader modern memory-promotion rules through confirmed specialization/support relationships.

Open cases include:

- historical Layer-0 110 percent budget auto-limit versus current FinOps hard-stop semantics
- historical Layer-0 constitutional priority versus modern C0-C4, T0-T3, EIK, and Durable Rulebook governance
- historical synthetic/test-data boundary versus current evidence-state rules
- immutable raw archive and parse-before-promotion requirements versus current ingestion/continuity contracts
- affective context versus evidence-led reasoning
- historical 40 percent SLA padding versus a future current service-level policy
- historical line-item cost control versus current FinOps economic envelopes and causal cost lineage
- historical production-ready-only delivery language versus modern staged Test-first maturity
- historical soft-delete requirements versus modern privacy, erasure, invalidation, and audit retention
- system-wide anomaly Auto-Watch versus current observability architecture
- migration source-of-truth audit versus current canonical evidence and conflict-preservation rules
- historical resilience mechanisms versus a reusable modern resilience contract
- Infinitum weekly snapshot cadence versus continuous modern evidence capture
- Clarification Persistence versus safe reversible autonomy
- historical `CoMind AI` filename prefix versus CDES durable identity
- historical Replit incremental bundle behavior versus Git and reproducible-build workflows

No unresolved case is silently resolved by recency.

## Repository parity

This branch adds:

- `db/migrations/20261025_005_durable_rulebook_registry.sql`
- `db/migrations/20261025_006_drule_002_rule_archaeology_reconciliation.sql`
- `db/sql/20261025_drule_002_layer0_archaeology_seed.sql`
- `db/verification/20261025_drule_002_rule_archaeology_reconciliation_verification.sql`
- this provenance record

The first draft used migration sequence numbers `002` and `003`. Repository review found that CFR owns `20261025_002` through `20261025_004`, so DRULE-002 was renumbered to `005` and `006` before merge consideration.

The repository migration is intentionally cleaner than the live construction sequence. Two intermediate relational defects were detected and repaired during live implementation:

1. The first reconciliation-member primary key shape incorrectly forced both optional member references non-null.
2. Dropping that composite key did not remove the inherited `NOT NULL` flags.

The repository version directly models `pm_rule_reconciliation_members` with its own UUID primary key, nullable `rule_id` / `candidate_id`, an XOR check, and partial uniqueness indexes.

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
