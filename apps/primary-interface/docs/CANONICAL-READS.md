# PI-001 canonical read projections 003

T1 repository-only development under Joseph's continuation authority. No live reads, grants, endpoint, credential or database change. Pure module: `src/canonical-projections.mjs`. It cannot authenticate a caller or certify supplied source data.

## Source contracts

| Domain | Canonical identity | Established mapping | Explicitly unresolved |
| --- | --- | --- | --- |
| Foundry attention | cm_foundry_authorization_request.authorization_request_id | Preserve pending/approved/denied/cancelled/expired verbatim; preserve reason and requested authority/environment/target separately | A request reason is not proof work stopped. Requested authority is not granted authority. No lane FK, PI revision, recommendation, consequences or verified evidence policy |
| Project decisions | pm_decision_records.id | Preserve work_item_id and recorded selection/rationale/time | A selected option is not Foundry approval. No common lifecycle or optimistic concurrency revision |
| Development lanes | pm_work_items.id, item_type=lane | Preserve work_key, project_id, status, owner and current summary | No inference of running chat/VE, dependencies, GitHub checks or next authority boundary |

IDs namespace the original database key by relation; original key remains separately available. Unknown scalar values stay visible. Unknown status adds an explicit blocker. Null is unknown, never an invented value. Unknown fields, free-form metadata and evidence JSON are excluded pending field-level review, rather than exposed wholesale. No input record is silently dropped: malformed or duplicate identifiers invalidate the page. Errors must become failed source state at an eventual caller boundary, not successful empty results.

Foundry decisions join only by authorization_request_id, PM decisions by work_item_id. Foundry project/task keys belong to comind, while PM keys belong to comind_pm. No cross-domain equivalence is established. This slice does not perform joins or claim decision/request consistency. Raw times are source claims, not freshness guarantees. revision=null is deliberate: timestamps and observation time are not concurrency tokens. All decisions remain disabled.

## Envelope and bounded retrieval

Input requires state (ok/partial/missing/failed/forbidden), observedAt with explicit timezone, reviewed scope, limit 1..100, moreAvailable and rows. Output retains those assertions and reports bounded-window coverage, returned count and unknown total. Successful empty differs from unavailable. Unavailable states cannot carry rows. Partial and moreAvailable remain explicit; neither a full page nor moreAvailable=false establishes complete registry coverage. A source unavailable during refresh must not be replaced by cached success without separate provenance.

The pure projection accepts caller assertions; it does not verify project access, observation clock, SQL isolation or retrieval order. A trusted reader must enforce project/lane scope, deterministic key ordering, limit+1 retrieval, response byte limits and timeouts. No cursor is implemented; do not repeatedly fetch bounded windows as a lossless feed. No source page is mounted into the browser yet.

## Trusted-server boundary and activation blockers

DRB-002 branch drb-002-governed-query at 842f0cd defines a separate loopback server prototype. Its docs/runbook/DRB-002.md and server/src/runbook/query-service.ts were inspected. It allowlists four views, binds filters, uses restricted-login configuration and server bearer principals, and declares activation blockers. It is not deployed identity or RLS proof. PI does not copy its routes, grant permissions or put its bearer token in a browser.

DRB-002 lane responses omit work-item UUID, owner and project UUID. Its source view also omits the work-item UUID. Therefore they cannot currently satisfy this module's lane input. Do not fabricate a UUID from work_key. Resolve by reviewed extension in the owning DRB lane or an explicitly approved alternative server projection. No duplicate lane registry.

| Blocked operation | Necessary input | Responsible resolver | Evidence |
| --- | --- | --- | --- |
| Browser operational reads | Operator identity, project scope, TLS/session policy, field allowlist, restricted database role and real denial proof | PI security owner with Joseph for activation authority | AGENTS.md; DRB-002 activation checklist; private schema revokes in DRB-001 |
| DRB lane adaptation | Canonical work-item UUID and explicit selected fields | DRB owner with PI | DRB-002 columns.lanes; v_runbook_lane_state definition |
| Complete attention assessment | Authored recommendation/consequences, canonical lane/RunBook links, revision and evidence policy | Foundry/DRB owners with PI | 006 substrate and PM ledger definitions; SOURCE-MAP.md |
| Current lane dependencies and checks | Explicit FK edges, repository/head-bound verification, observation coverage | PM/DRB integration owner | pm_work_item_dependencies; pm_links; pm_verifications |

Future trusted consumer must authenticate before source access, authorize exact project/field scope, use a dedicated SELECT-only role, keep private schemas inaccessible to browser roles, and return only reviewed projections with no-store and redacted failures. Test actual login/RLS denial, project isolation, timeouts, byte bounds and unchanged data before activation. No service-role fallback. Source summaries remain untrusted text. This document is a review contract, not implemented security enforcement or activation approval.

Recovery: revert PI-only files. No deployment or database rollback. Cost: no packages, model calls or provider usage; linear work in at most 100 supplied rows. Proposed NIST AC-3/AC-6/AU-3 traceability only, no compliance claim.

## UUID gap resolved in development

Integration #146 merged into DRB development at 720209a518e440f29d2418145b962ba8232ca164. A fixed read-only join on globally unique work_key now supplies canonical work-item/project UUIDs, type, owner, priority and updated_at without changing schemas or grants. The earlier missing-field blocker is resolved for that development contract. Restricted PostgreSQL-to-DRB-to-PI proof passed at 695b920: https://github.com/jlhogarth/CoMind/actions/runs/39069689578 . This is isolated proof, not deployed access. PI adopts the same adapter and now renders lane list/detail from supplied envelopes. Missing complete authority/dependency/evidence relationships do not block read-only inspection; they remain visibly unknown.
