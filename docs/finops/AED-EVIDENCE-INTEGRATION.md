# AED evidence to FinOps, bounded read-only integration

Owner: FinOps issue #550. AED-007 issue #540 / PR #541 remains owner of AED collection, persistence, monitoring and recovery. This lane does not edit AED-007 or CI-FINOPS implementation. Environment: CoMind Test. No Production change or paid service.

## Implemented slice
`aed_execution_evidence_projection.sql` is a SELECT-only, schema-qualified projection against the two existing private `comind_pm` monitoring tables. It is **not** a deployed view or new database schema. It preserves execution identity, lane, ordered event coverage, first/last UTC timestamps, source/artifact SHA-256 and GitHub run link. It flags incomplete sequence coverage, missing hashes and provider-tagged records. It never invents a provider charge. Execution total is NULL unless all event costs are present; `priced_events` and `cost_coverage` explicitly communicate coverage. Even fully populated event costs require receipt validation before classifying them as billed Work charges.

## Reuse contract: personal-plan meter intake
AED-007's existing personal-plan intake and digest-bound before/after observation mechanism is the only approved account-meter observer. Consume its **validated derived output**, not screenshots, credentials or raw account pages. Join only on a cryptographically matched execution digest and explicitly linked execution ID, not merely overlapping timestamps. Keep the account allowance delta separate from API USD costs. Mark the difference as **shared-account unallocated** unless isolation and concurrency checks justify stronger attribution. Preserve reading timestamps, units, source, refresh latency, interval overlap and provenance. Do not synthesize observations for historical executions.

## Verified CoMind Test readback, 2026-11-09
The exact SELECT in this directory ran successfully against Supabase project `sbgfuanxiqepcoboxzcl`:
- `580f3fad73905c8230b2bfc8`: 65/65 events, 65 hashes, 1 provider-tagged, 0 priced, sequence complete.
- `46a39216f4a41b89382a3fb1`: 122/122 events, 122 hashes, 1 provider-tagged, 0 priced, sequence complete.
- `19a6a6fe965a0526017a656c`: 59/59 events, 59 hashes, 1 provider-tagged, 0 priced, sequence complete.
- Total 246, all actual-cost totals NULL. No Work allowance delta established.
- Existing `public.comind_usage_events`, `public.comind_cost_reservations`, `public.comind_cost_alerts` and `comind.cm_api_cost_receipt` were previously counted at zero; recheck before relying on freshness.

## Security and acceptance
Use an authorized private server-side reader or a governed sanitized AED export. Do not expose `comind_pm` through the Data API or grant `anon` / `authenticated` SELECT. Projection SQL has no DDL/DML. No secrets or raw event payloads are exported. Repeat the query at current head and assert three executions, 246 total events, 246 hashes, zero priced events, and all three `sequence_complete=true` before accepting the baseline. These assertions apply only to the recorded baseline, not to future runs.

## Next slices, not yet implemented
1. Reuse AED-007's exact current intake script/API after a branch freshness and collision review; implement a typed adapter for its validated output.
2. Add a pure deterministic reconciliation function and tests for missing values, duplicate IDs, partial costs, mismatched digests, nonbracketing observations, refresh delay, concurrent activity, and units.
3. Present a protected FinOps/FlowOps report with evidence coverage, cost confidence, provenance drill-down, allowance depletion and separate provider billing, and clear unknown states.
4. Test an isolated execution with actual before/after account observations supplied through the existing secure mechanism; do not claim exact per-process Work billing without provider-level support.
5. CI and governance readback, review, then non-Production merge only if all checks pass.

## Evidence
- AED-007 checkpoint: https://docs.google.com/document/d/1CNNQYLWXXCi_D6B_3gHPwoKIZF7kXFbTv4_tU-v7ydo/edit
- Private cost register: https://docs.google.com/spreadsheets/d/1bmexEZ1KGFblStLNZOdX5qm7CagqqG1o9T1-0zHl9b8/edit
- Issue #550: https://github.com/jlhogarth/CoMind/issues/550
- AED ownership: https://github.com/jlhogarth/CoMind/issues/540
