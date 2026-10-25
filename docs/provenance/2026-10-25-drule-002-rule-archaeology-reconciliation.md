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

## Verified capture state

At the DRULE-002 verification checkpoint, the canonical CoMind project contained:

- 113 normalized rules
- 113 current rule versions
- 113 direct rule-source links
- 19 source documents in the initial source census before the next conversation-archaeology batch
- 8 initial unresolved candidates before the next conversation-archaeology batch
- 2 typed rule relationships
- 7 reconciliation cases
- 17 reconciliation-case members
- 32 Layer-0 archaeology queue entries
- 28 Layer-0 sections still open for source recovery
- 4 Layer-0 sections partially reconstructed from surviving clause text

Subsequent conversation archaeology added further source documents and candidates without promoting them automatically.

## Layer-0 recovery state

The recovered `CoMind Layer-0 (ILP) Rulebook v2` is dated 2025-08-30 and identifies 32 domains.

The surviving readable artifact preserves the complete section taxonomy, but substantive clause text is available only for:

- Section 29: Service Level Agreements
- Section 30: Interoperability and Standards
- Section 31: Cost and Resource Governance
- Section 32: Emerging / Forward Controls

Sections 1 through 28 therefore remain explicit source-recovery gaps. Their headings are evidence that the domains existed; they are not evidence of the missing clause wording.

Founder conversation evidence separately confirms that the 2025 Layer-0 expansion was intended to be comprehensive, that SLA/interoperability/cost governance were explicitly added, that SLA timing received a 40 percent pad, that exact budget numbers were deferred while line-item cost controls remained required, and that top-shelf forward controls were authorized. Individual assistant-proposed rule examples remain lower-authority candidates until corroborated by founder approval, a final artifact, later canonical policy, or implementation evidence.

## Initial reconciliation cases

Open cases include:

- historical Layer-0 110 percent budget auto-limit versus current FinOps hard-stop semantics
- historical Layer-0 constitutional priority versus modern C0-C4, T0-T3, EIK, and Durable Rulebook governance
- historical synthetic/test-data boundary versus current evidence-state rules
- immutable raw archive and parse-before-promotion requirements versus current ingestion/continuity contracts
- affective context versus evidence-led reasoning
- historical 40 percent SLA padding versus a future current service-level policy
- historical line-item cost control versus current FinOps economic envelopes and causal cost lineage

No unresolved case is silently resolved by recency.

## Repository parity

This branch adds:

- `db/migrations/20261025_002_durable_rulebook_registry.sql`
- `db/migrations/20261025_003_drule_002_rule_archaeology_reconciliation.sql`
- `db/verification/20261025_drule_002_rule_archaeology_reconciliation_verification.sql`

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

## Known remaining work

- Recover substantive Layer-0 clause text for sections 1 through 28 from conversations, exports, alternate files, historical code, and later documents.
- Reconcile historical rules against current accepted architecture instead of blindly reactivating them.
- Add reproducible data seeding/snapshot support for the initial rule catalog and archaeology state.
- Expand typed relationships among predecessor, successor, equivalent, specialized, conflicting, and superseding rules.
- Define activation review so only approved authority can move candidates into active rule versions.
- Add deterministic lifecycle-gate evaluation for machine-checkable rules.
- Connect Rulebook identifiers into CDES / EDG documentation relationships without creating a second authority store.

## Authority

Founder authorization for this phase was granted 2026-10-25. Existing production, C4, and stronger security controls remain in force.
