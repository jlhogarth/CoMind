# EDG-002 — Durable Rulebook Graph Integration

**Date:** 2026-10-27  
**Issue:** #221  
**Pull request:** #269  
**Status:** Isolated CI and private Test verified; final freshness/matrix pending  
**Environment:** Private Test verified  
**Production:** Unchanged

## Purpose

EDG-002 connects the canonical Durable Rulebook to the existing Enterprise Documentation Graph (EDG) without creating a second source of rule authority.

The core invariant is:

`EDG projection != Rulebook authority`

Canonical rule text, exact versions, lifecycle, authority, reconciliation, evaluation, composition, and evidence remain in `comind_pm`. The graph stores durable identities, pointers, navigation, and evidence-backed relationships.

## Verified starting state

Implementation was refreshed onto `main` at `dfcae33a517689c38c2a045bc8d04181e4198a35` before the repository package was authored.

Private Test inspection established:

- EDG-001 is v0.2;
- 51 concept entities exist;
- 44 active concept-to-concept relationships exist;
- one historical concept relationship is retired;
- RRR-001 exists as a governed artifact projection;
- 157 canonical Rulebook rules exist;
- zero `RULE-*` graph projections existed before EDG-002;
- both graph base tables were private by grants but had RLS disabled;
- the live `comind_development.entity` / `relationship` foundation was not reconstructable from repository migrations.

That repository-parity gap is repaired inside Issue #221 because blank-database reconstruction is an EDG-002 acceptance prerequisite, not a separate product capability.

## EDG-001 and RRR-001 source basis

EDG-001 v0.2 remains the governing graph specification and defines the graph as an indexing/relationship layer rather than canonical record replacement.

Source document:

- `1XvRvIoLJTMboeg4kOdBs2zOGlDM7VezMFZVPp_15GVE`

RRR-001 v0.1 remains a governed human-readable reconciliation projection rather than a second rule store. Its canonical mapping ledger explicitly names 35 distinct existing Rulebook identities. EDG-002 uses only those direct mappings for RRR-to-Rule edges.

Source document:

- `19rAT1rHJRQW2GWEwe2mJs332C5yakd0nFIewekAZ87o`

Supported-but-not-one-to-one RRR candidates and unresolved candidates are not promoted into canonical graph edges.

## External best-practice review

Reviewed before implementation:

- PostgreSQL 17 row-level security and default-deny behavior;
- PostgreSQL function security guidance;
- PostgreSQL view security behavior;
- Supabase row-level security guidance, including the fact that `service_role` bypasses RLS;
- Supabase database-function security guidance;
- W3C PROV entity/relationship provenance principles.

Development Journal research/architecture event:

`ddf13203-a62e-45a3-96d1-2d44a497fc6e`

Decision: reuse the existing PostgreSQL graph registry. Do not introduce another graph datastore or extension. Keep the base graph tables unavailable to service-role clients and expose only narrow read views plus a controlled synchronization function.

## Repository package

### Graph foundation parity

`db/migrations/20261027_005_edg_graph_registry_foundation_parity.sql`

Non-destructively source-controls the existing live graph contract:

- `comind_development.entity`;
- `comind_development.relationship`;
- exact foreign keys/checks/indexes;
- the existing development evidence views;
- restrictive base grants.

The migration uses `CREATE ... IF NOT EXISTS` / `CREATE OR REPLACE VIEW` and does not drop or recreate live graph data.

### Rulebook graph integration

`db/migrations/20261027_006_edg_002_rulebook_graph_integration.sql`

Adds:

- RLS on both graph base tables;
- explicit removal of base-table privileges for `public`, `anon`, `authenticated`, and `service_role`;
- `edg_sync_rulebook_projections(text,text)`;
- `v_rulebook_graph`;
- `v_rule_graph_relationships`;
- minimum service-role usage, view SELECT, and sync EXECUTE grants.

The synchronizer is `SECURITY DEFINER`, pins `search_path=''`, schema-qualifies objects, requires an evidence reference and actor, and is bounded to the canonical COMIND Rulebook.

## Rule projection contract

Every canonical Rulebook rule becomes addressable through its existing `RULE-*` key.

The EDG entity payload stores pointer/index metadata only:

- canonical Rulebook UUID;
- canonical rule key;
- canonical schema/table/version-table locators;
- projection role;
- explicit authority boundary;
- latest sync evidence reference.

EDG does not independently copy authoritative `rule_text`, `formal_rule`, approval status, authority, scope, enforcement state, REE result, or RCO outcome.

`v_rulebook_graph` joins current canonical `pm_rules` / `pm_rule_versions` data at query time and labels the graph projection as non-authoritative.

## Lifecycle behavior

Synchronization is deterministic and idempotent.

A canonical rule added or changed updates its pointer projection. A graph rule identity whose canonical record no longer resolves is marked `projection_orphaned`; it is not silently deleted. Relationship history remains intact.

## RRR-001 Rule relationships

`db/sql/20261027_edg_002_rrr_rule_mappings.sql`

Seeds exactly 35 direct RRR-001 `DESCRIBES` edges, one for each distinct Rulebook key named in the explicit canonical mapping ledger.

Each relationship records:

- RRR-001 as subject and evidence entity;
- canonical `RULE-*` projection as object;
- source document ID/URL/version;
- originating RRR candidate identifiers;
- explicit canonical-mapping assertion type;
- authority boundary stating that documentary provenance does not establish Rulebook authority.

## Concept-to-Rule boundary

Current Rulebook scope/source/evidence inspection found no explicit canonical `concept:*` mapping.

Therefore EDG-002 creates **zero Concept → Rule edges**. This is intentional evidence discipline, not an incomplete implementation. Domain/title similarity, recency, embeddings, and model judgment are insufficient to mint canonical graph relationships.

## Isolated PostgreSQL 17 verification

Exact-head workflow run:

- https://github.com/jlhogarth/CoMind/actions/runs/40577985831
- verified repository head: `e51ea32b8c2b04309f46db2abc53c43cf1e8ad79`
- conclusion: **success**

The isolated runner reconstructed the lower PM Ledger → Rulebook → DRULE-002 → DRULE-003 → AUTH-001 → REE-001 → RCO-001 chain from blank PostgreSQL 17, replayed both EDG migrations twice, replayed the RRR seed twice, and passed the structural/adversarial verifier.

Verified behaviors included:

- repository reconstruction of the graph foundation;
- migration replay safety;
- RLS and grant boundary;
- complete rule projection;
- pointer-only graph payloads;
- canonical joined views;
- exactly 35 explicit RRR mappings;
- zero inferred Concept → Rule relationships;
- same-evidence synchronization idempotency;
- orphaned projection retirement without deletion.

## Private Test verification

Both repository migrations were applied to private Test only after isolated CI passed.

First canonical Rulebook synchronization using evidence ref `github:pr/269@e51ea32b8c2b04309f46db2abc53c43cf1e8ad79` returned:

- canonical rules: **157**;
- current rule projections: **157**;
- changed projections: **157**;
- orphaned projection updates: **0**.

The exact RRR-001 mapping seed created **35** current `DESCRIBES` Rule relationships.

Regression/security verification then proved:

- concept entities: **51**, unchanged;
- active concept-to-concept edges: **44**, unchanged;
- retired concept-to-concept edges: **1**, unchanged;
- canonical rules: **157**;
- current Rule projections: **157**;
- RRR-001 Rule edges: **35**;
- active Concept → Rule edges: **0**;
- unresolved canonical joins: **0**;
- rule-version pointer mismatches: **0**;
- graph projections marked authoritative: **0**;
- forbidden authoritative fields copied into graph payloads: **0**;
- graph base tables with RLS disabled: **0**;
- direct base-table grants to public/anon/authenticated/service_role: **0**.

Privilege verification proved:

- `service_role` has schema usage: **yes**;
- `service_role` can select `v_rulebook_graph`: **yes**;
- `service_role` can select `v_rule_graph_relationships`: **yes**;
- `service_role` can select base `entity`: **no**;
- `service_role` can select base `relationship`: **no**;
- `service_role` can execute the controlled sync: **yes**;
- anon/authenticated can execute sync: **no**;
- anon/authenticated can read the Rulebook view: **no**;
- sync function is security definer: **yes**;
- sync function search path is pinned empty: **yes**.

Same-evidence synchronization replay returned **0 changed** and **0 orphan updates**.

A rollback-only live lineage proof inserted a synthetic orphan Rule projection, ran synchronization, verified it became `projection_orphaned`, rolled the transaction back, and confirmed no synthetic row persisted.

Development Journal Test verification event:

`52712417-cf9d-47f6-aabc-95105eba7e72`

## Verification package

- `db/verification/20261027_edg_002_rulebook_graph_integration_verification.sql`
- `scripts/test_edg_002_rulebook_graph_integration.sh`
- `.github/workflows/edg-002-rulebook-graph-integration.yml`

## Current merge gate

At this checkpoint:

- repository package: **authored**;
- draft PR #269: **open**;
- isolated exact-head EDG CI on `e51ea32b...`: **passed**;
- private Test migration: **passed**;
- private Test behavioral/security proof: **passed**;
- Development Journal Test evidence: **recorded**;
- final current-main freshness reconciliation: **pending**;
- final exact-head repository matrix after this provenance update/freshness reconciliation: **pending**;
- production: **unchanged**.

PR #269 must remain draft until the branch is reconciled against then-current `main`, migration/schema collisions are rechecked, the final immutable exact-head matrix is terminal green, and the final diff/race check passes.
