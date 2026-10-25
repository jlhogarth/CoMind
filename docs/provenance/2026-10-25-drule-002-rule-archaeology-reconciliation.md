# DRULE-002 Rule Archaeology and Reconciliation Evidence

Date: 2026-10-25  
Issue: #185  
Branch: `drule-002-rule-archaeology-reconciliation`  
Environment: CoMind Test / private `comind_pm` schema  
Production: unchanged and not authorized by this work

## Purpose

DRULE-002 turns the Durable Rulebook into a governed reconciliation system. Historical text, founder instructions, current policy, implementation evidence, and operational proof are not treated as equivalent authority states.

The core rule is: discovery does not equal activation.

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

All Rulebook and DRULE-002 tables have RLS enabled. `anon`, `authenticated`, and `PUBLIC` have no table grants. `service_role` has the governed private access path.

## Current capture state

After the next archaeology pass, the canonical CoMind project contains:

- 123 normalized rules
- 123 current rule versions
- 123 direct rule-source links
- 29 source documents in the source census
- 24 unresolved rule candidates
- 2 typed rule relationships
- 13 reconciliation cases
- 32 Layer-0 archaeology queue entries
- 28 Layer-0 sections still open for original clause recovery
- 4 Layer-0 sections partially reconstructed from surviving clause text

The additional normalized rules include ten RPDA frozen structural invariants captured as `specified`, not silently promoted to active policy. Conversation archaeology also distinguishes founder-approved instructions from assistant-proposed historical suggestions through separate authority confidence and source status.

## Layer-0 recovery state

The recovered `CoMind Layer-0 (ILP) Rulebook v2` is dated 2025-08-30 and identifies 32 domains.

The surviving readable artifact preserves the complete section taxonomy, but substantive clause text is available only for:

- Section 29: Service Level Agreements
- Section 30: Interoperability and Standards
- Section 31: Cost and Resource Governance
- Section 32: Emerging / Forward Controls

Sections 1 through 28 therefore remain explicit source-recovery gaps. Their headings are evidence that the domains existed; they are not evidence of the missing clause wording.

Founder conversation evidence separately confirms that the 2025 Layer-0 expansion was intended to be comprehensive, that SLA/interoperability/cost governance were explicitly added, that SLA timing received a 40 percent pad, that exact budget numbers were deferred while line-item cost controls remained required, and that top-shelf forward controls were authorized.

Later architecture is recorded as successor evidence without being misrepresented as verbatim recovery of 2025 wording. Examples include RPDA invariants around immutable raw evidence, append-only correction, provenance-bearing inference, separation of prediction/recommendation/decision/authorization, and lineage-aware invalidation.

Individual assistant-proposed historical rule examples remain lower-authority candidates until corroborated by founder approval, a final artifact, later canonical policy, or implementation evidence.

## Reconciliation cases

Open cases now include:

- historical Layer-0 110 percent budget auto-limit versus current FinOps hard-stop semantics
- historical Layer-0 constitutional priority versus modern C0-C4, T0-T3, EIK, and Durable Rulebook governance
- historical synthetic/test-data boundary versus current evidence-state rules
- immutable raw archive and parse-before-promotion requirements versus current ingestion/continuity contracts
- affective context versus evidence-led reasoning
- historical 40 percent SLA padding versus a future current service-level policy
- historical line-item cost control versus current FinOps economic envelopes and causal cost lineage
- explicit memory approval versus current memory-promotion authority classes
- historical production-ready-only delivery language versus modern staged Test-first maturity
- historical soft-delete requirements versus modern privacy, erasure, invalidation, and audit retention
- system-wide anomaly Auto-Watch versus current observability architecture
- migration source-of-truth audit versus current canonical evidence and conflict-preservation rules
- historical resilience mechanisms versus a reusable modern resilience contract

No unresolved case is silently resolved by recency.

## Repository parity

This branch adds:

- `db/migrations/20261025_005_durable_rulebook_registry.sql`
- `db/migrations/20261025_006_drule_002_rule_archaeology_reconciliation.sql`
- `db/sql/20261025_drule_002_layer0_archaeology_seed.sql`
- `db/verification/20261025_drule_002_rule_archaeology_reconciliation_verification.sql`

The first draft used migration sequence numbers `002` and `003`. Repository review found that CFR already owns `20261025_002` through `20261025_004`, so DRULE-002 was renumbered to `005` and `006` before merge consideration.

The repository migration is intentionally cleaner than the live construction sequence. Two intermediate relational defects were detected and repaired during live implementation:

1. The first reconciliation-member primary key shape incorrectly forced both optional member references non-null.
2. Dropping that composite key did not remove the inherited `NOT NULL` flags.

The repository version directly models `pm_rule_reconciliation_members` with its own UUID primary key, nullable `rule_id` / `candidate_id`, an XOR check, and partial uniqueness indexes.

## Verification

Live Test verification established:

- all required tables exist
- all required views exist
- all governed tables have RLS enabled
- service-role SELECT access exists
- no client/public table grants exist
- reconciliation member rule/candidate columns are nullable
- XOR membership semantics are present
- partial uniqueness indexes exist
- current Rulebook rows have matching versions and provenance links

The Layer-0 seed was replayed idempotently against Test.

A paid Supabase development branch was considered for repository replay. The platform required a fresh cost-confirmation flow. DRULE-002 therefore used a zero-recurring-cost schema-isolated replay inside the Test project instead. The replay created a temporary `comind_drule002_replay` schema, recreated the corrected rule/reconciliation contracts, inserted both rule-backed and candidate-backed reconciliation members plus archaeology seed data, asserted RLS/nullability/XOR behavior, and dropped the scratch schema in the same successful migration. Production remained unchanged.

## Known remaining work

- Recover substantive Layer-0 clause text for sections 1 through 28 from conversations, exports, alternate files, historical code, and later documents.
- Reconcile historical rules against current accepted architecture instead of blindly reactivating them.
- Expand reproducible seeding/snapshot support beyond the initial Layer-0 archaeology set.
- Expand typed relationships among predecessor, successor, equivalent, specialized, conflicting, and superseding rules.
- Define activation review so only approved authority can move candidates into active rule versions.
- Add deterministic lifecycle-gate evaluation for machine-checkable rules.
- Connect Rulebook identifiers into CDES / EDG documentation relationships without creating a second authority store.

## Authority

Founder authorization for this phase was granted 2026-10-25. Existing production, C4, and stronger security controls remain in force.
