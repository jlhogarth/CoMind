# PI-001 canonical read projections 003

T1 isolated development under Joseph's continuation authority. No production reads, grants, credentials or database changes. The integration branch now has a loopback API and a test-only PostgreSQL permission fixture. Pure module: `src/canonical-projections.mjs`. It cannot authenticate a caller or certify supplied source data.

## Source contracts

| Domain | Canonical identity | Established mapping | Explicitly unresolved |
| --- | --- | --- | --- |
| Foundry attention | cm_foundry_authorization_request.authorization_request_id | Preserve pending/approved/denied/cancelled/expired verbatim; preserve reason and requested authority/environment/target separately | A request reason is not proof work stopped. Requested authority is not granted authority. No lane FK, PI revision, recommendation, consequences or verified evidence policy. Its `cm_project.project_id` is not related to `pm_projects.id` by a declared cross-domain key |
| Project decisions | pm_decision_records.id | Preserve work_item_id, project_id, project_key, item_type, work_key and recorded selection/rationale/time through declared UUID joins | A selected option is not Foundry approval. No common lifecycle or optimistic concurrency revision |
| Development lanes | pm_work_items.id, item_type=lane | Preserve work_key, project_id, status, owner and current summary | No inference of running chat/VE, dependencies, GitHub checks or next authority boundary |

IDs namespace the original database key by relation; original key remains separately available. Unknown scalar values stay visible. Unknown status adds an explicit blocker. Null is unknown, never an invented value. Unknown fields, free-form metadata and evidence JSON are excluded pending field-level review, rather than exposed wholesale. No input record is silently dropped: malformed or duplicate identifiers invalidate the page. Errors must become failed source state at an eventual caller boundary, not successful empty results.

Foundry decisions join only by authorization_request_id, PM decisions by work_item_id. Foundry project/task keys belong to comind, while PM keys belong to comind_pm. No cross-domain equivalence is established. This slice does not perform joins or claim decision/request consistency. Raw times are source claims, not freshness guarantees. revision=null is deliberate: timestamps and observation time are not concurrency tokens. All decisions remain disabled.

Repository source inspection confirms the mapping gap: Foundry authorization requests reference `comind.cm_project.project_id` (UUID); PM lanes/decisions reference `comind_pm.pm_projects.id` (UUID) and expose `project_key` (text). The PM `source_system`/`source_ref` and `pm_links.external_id` columns are not constrained to Foundry project identifiers, so they do not establish a mapping by themselves. Required input is an owner-reviewed, durable cross-domain project mapping with cardinality and lifecycle rules. Resolver: PI/Foundry/PM source owners together. Until that mapping and a read role scoped to it are evidenced, Foundry requests must not be filtered by a PM project key or mixed into the PM reader.

## Envelope and bounded retrieval

Input requires state (ok/partial/missing/failed/forbidden), observedAt with explicit timezone, reviewed scope, limit 1..100, moreAvailable and rows. Output retains those assertions and reports bounded-window coverage, returned count and unknown total. Successful empty differs from unavailable. Unavailable states cannot carry rows. Partial and moreAvailable remain explicit; neither a full page nor moreAvailable=false establishes complete registry coverage. A source unavailable during refresh must not be replaced by cached success without separate provenance.

The pure projection accepts caller assertions; it does not verify project access, observation clock, SQL isolation or retrieval order. The isolated server path enforces project scope, deterministic ordering, limit+1 retrieval, response byte limits and timeouts for lane and project-decision reads. No cursor is implemented; do not repeatedly fetch bounded windows as a lossless feed. The opt-in connected page renders those two source domains separately. The default cockpit remains disconnected.

## Trusted-server boundary and activation blockers

DRB-002 branch drb-002-governed-query at 5331d4 defines a separate loopback server prototype. Its docs/runbook/DRB-002.md and server/src/runbook/query-service.ts were inspected. The PI integration branch extends its allowlist with one PM decision relation, binds project/work-item filters, uses restricted-login configuration and server bearer principals, and declares activation blockers. It is not deployed identity or production RLS proof. PI does not put its bearer token in a browser.

DRB-002 lane responses were extended in development to return canonical work-item UUID, owner and project UUID through a fixed unique-work-key join. The project-decision read separately joins `pm_decision_records.work_item_id` to `pm_work_items.id` and `pm_work_items.project_id` to `pm_projects.id`. These joins are exercised in the disposable PostgreSQL CI test. The test-only reader grant and COMIND-only RLS policy in `db/test/drb_002_reader.sql` do not establish production grants or policies. No duplicate lane or decision registry is created.

| Blocked operation | Necessary input | Responsible resolver | Evidence |
| --- | --- | --- | --- |
| Production browser reads | Operator identity, project scope, TLS/session policy, production restricted database role and production denial proof | PI security owner with Joseph for activation authority | AGENTS.md; DRB-002 activation checklist; private schema revokes in DRB-001 |
| Production project-decision source access | Reviewed SELECT grant and project RLS policy for `pm_decision_records`, plus host-specific PI/DRB credential setup | DRB database owner with PI security owner | `db/test/drb_002_reader.sql` is test-only; PM ledger RLS and decision-record FK definitions |
| Foundry request read scoped from a PM project | Owner-reviewed crosswalk from Foundry project UUID to PM project key/UUID, with cardinality and lifecycle semantics, plus a read role and row policy | PI, Foundry and PM source owners | `20261008_006_foundry_agent_substrate.sql` request FK; `20261006_001_comind_pm_ledger.sql` project key/source-reference definitions; no declared cross-domain FK |
| Complete attention assessment | Authored recommendation/consequences, canonical lane/RunBook links, revision and evidence policy | Foundry/DRB owners with PI | 006 substrate and PM ledger definitions; SOURCE-MAP.md |
| Current lane dependencies and checks | Explicit FK edges, repository/head-bound verification, observation coverage | PM/DRB integration owner | pm_work_item_dependencies; pm_links; pm_verifications |

Trusted consumer authenticates before source access, authorizes exact project/field scope, uses the DRB restricted reader, keeps private schemas inaccessible to browser roles, and returns only reviewed projections with no-store and redacted failures. Disposable PostgreSQL CI verifies login/RLS scope, project isolation, timeouts, byte bounds and unchanged data. Production grants and live access remain unverified. No service-role fallback. Source summaries remain untrusted text. This document is a review contract, not production security approval.

Recovery: revert PI-only files. No deployment or database rollback. Cost: no packages, model calls or provider usage; linear work in at most 100 supplied rows. Proposed NIST AC-3/AC-6/AU-3 traceability only, no compliance claim.

## Trusted PM decision read, isolated extension

The API adds `GET /api/pi/decisions` using the same operator cookie, project check, distinct server-only DRB principal, origin controls, time/byte/concurrency bounds and metadata audit as lane reads. DRB accepts only the `decisions` query kind and selects an explicit field list. Its join path is `pm_decision_records.work_item_id -> pm_work_items.id -> pm_projects.id`; the first relation is unique by migration constraint. Project and optional work key are parameterized. The response carries source relations, bounded coverage and retrieval time. Browser code displays the canonical record with `textContent` and includes no decision controls.

The project-decision source remains distinct from Foundry authorization requests and the presentation-only human-action assessment. A selected option does not establish approval, authority, evidence truth or completed human review. Test-only permissions scope the fixture reader to the synthetic COMIND project. No production database grants or RLS policies changed. The Foundry project UUID to PM project key relationship remains unverified, so Foundry authorization requests are not mixed into this page.

Exact-head PostgreSQL and browser CI must prove this extension before acceptance. Local TypeScript build and 65 focused PI/server contract tests pass; the complete server suite reports 209 passed and 7 database-dependent skips. Local Chromium and PostgreSQL executables are unavailable in this environment.

## UUID gap resolved in development

Integration #146 merged into DRB development at 720209a518e440f29d2418145b962ba8232ca164. A fixed read-only join on globally unique work_key now supplies canonical work-item/project UUIDs, type, owner, priority and updated_at without changing schemas or grants. The earlier missing-field blocker is resolved for that development contract. Restricted PostgreSQL-to-DRB-to-PI proof passed at 695b920: https://github.com/jlhogarth/CoMind/actions/runs/39069689578 . This is isolated proof, not deployed access. PI adopts the same adapter and now renders lane list/detail from supplied envelopes. Missing complete authority/dependency/evidence relationships do not block read-only inspection; they remain visibly unknown.
