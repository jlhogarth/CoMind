# DRB-001 Durable RunBook Live Foundation

Date: 2026-10-16 America/Indiana/Indianapolis

## Objective

Establish a concise, relational, append-oriented Durable RunBook in the existing CoMind project-management ledger so project development can record actions, results, pass and fail verification, approvals, clearances, evidence, and next actions without storing large narrative transcripts.

## Live target

- Supabase project: `CoMind`
- Project ref: `sbgfuanxiqepcoboxzcl`
- PostgreSQL: 17.11
- Reused schema: `comind_pm`
- Base repository main at branch creation: `816966ecf7cb778f5a1942a536136862618845c3`

## Live migrations applied

1. `comind_pm_durable_runbook_ledger_v0_2`
2. `comind_pm_durable_runbook_capture_v0_2_1`
3. `comind_pm_durable_runbook_fk_indexes_v0_2_2`
4. `comind_pm_durable_runbook_private_boundary_v0_2_3`
5. `comind_pm_durable_runbook_service_role_policy_v0_2_4`

## Relational model added

- `pm_events` now carries occurrence time, explicit result summary, outcome, and consequential flag.
- `pm_authorizations` records approvals, clearances, delegations, revocations, and exceptions.
- `pm_verifications` records explicit checks and pass, fail, partial, blocked, or not-run outcomes.
- `pm_event_links` relates RunBook events to existing relational artifacts in `pm_links`.
- `lane` is now a supported work-item type.
- `record_runbook_event(...)` provides a single governed append path for future capture.
- `v_runbook_timeline`, `v_runbook_authority`, `v_runbook_verification`, and `v_runbook_lane_state` provide query surfaces.
- Consequential events automatically project the latest lane summary and timestamp into `pm_work_items` while preserving the immutable event history.

## Security boundary

- RLS is enabled on the event and new RunBook tables.
- `anon` and `authenticated` have no grants on the new tables or views.
- `service_role_full_access` follows the existing `comind_pm` RLS convention.
- Authorizations, verifications, and event-to-artifact relations are append-only through database triggers.
- `record_runbook_event(...)` is `SECURITY INVOKER`, not `SECURITY DEFINER`.

No public or authenticated HTTP endpoint was exposed in DRB-001. Endpoint exposure remains a separate security decision.

## Initial live records

Tracking was initialized for:

- `DRB-001` Queryable Durable RunBook Foundation
- `SDN-002` Sovereign Data Node: Production Boundary and Recovery Foundation
- `OC-002` Operator Console / Interface 002
- `LF-3` Live Foundry LF-3 Security and Compatibility Readiness

Known artifacts were linked relationally:

- `SDN-002` to GitHub PR #125
- `OC-002` to GitHub PR #119

Historical development activity was not fabricated. Only directly supported current facts and DRB-001 actions were inserted.

## Verification

`db/verification/drb_001_postdeploy.sql` was executed against the live CoMind database after deployment.

Result: `all_ok = true`

Verified true:

- event columns
- relational tables
- query views
- capture function
- append-only and projection triggers
- RLS enabled
- client roles ungranted
- service-role policies
- live DRB-001 lane seed
- live authorization capture
- live verification capture

## Ongoing capture policy

Capture concise consequential facts, including:

- action taken
- occurrence time
- result
- PASS, FAIL, PARTIAL, BLOCKED, COMPLETE, APPROVED, REJECTED, or PENDING outcome
- approval or clearance
- actor and authority source
- linked artifact or evidence
- next action

Do not duplicate full transcripts or routine command logs. Reference detailed evidence when available.
