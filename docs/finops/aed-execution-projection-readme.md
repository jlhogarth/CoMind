# FinOps AED evidence projection, Issue #550

## Verified 2026-11-09 against primary Supabase Test

The read-only query in `aed-execution-readonly-projection.sql` was executed against project `sbgfuanxiqepcoboxzcl` before committing. It returned exactly three executions, 65, 122, and 59 events, with all three `sequence_verified=true`. All three `actual_cost_usd` values were NULL. Each execution has one provider-tagged event; provider tags are not cost receipts. No table, view, policy, grant, or other database object was created.

The query joins only existing private AED execution and event relations, aggregates by immutable execution ID, checks event-count and sequence continuity, and preserves workflow and source/artifact SHA-256 provenance. It deliberately excludes raw event payload. It does not turn process elapsed time into Work credits.

## Reuse of existing observation intake

AED-007 Issue #540, draft PR #541, branch `issue-540-aed-007-transaction-monitor` owns the existing personal-plan before/after meter-observation intake. Do not create a duplicate capture or alter that lane from Issue #550. A future reconciled report must consume its *validated* observation output by execution digest, not by timestamp alone. Only after actual account snapshots exist may it report a shared-account allowance delta, labeled `observed_unallocated`; it must never call that an exact per-execution charge without exclusivity evidence. Unknown historical deltas remain NULL.

AED source: `apps/operator-console/docs/AED-007-RETRIEVAL.md`; Drive checkpoint: https://docs.google.com/document/d/1CNNQYLWXXCi_D6B_3gHPwoKIZF7kXFbTv4_tU-v7ydo/edit . FinOps audit: Issue #550. Canonical API Cost Register: https://docs.google.com/spreadsheets/d/1bmexEZ1KGFblStLNZOdX5qm7CagqqG1o9T1-0zHl9b8/edit . No provider receipt rows were found in `comind.cm_api_cost_receipt` at audit time. These are separate accounting categories.

## Acceptance and security

- Live query readback: PASS, three rows and 246 event counts; all three continuity checks true.
- Source provenance retained: PASS, execution ID, workflow URL, source and artifact hashes.
- Unknown cost not misrepresented as zero: PASS, NULL for all three executions.
- Existing observation intake reused by reference: DESIGN CONTRACT ONLY; no real meter observations available, no cross-source join yet.
- Authenticated application-level FinOps report, CI regression, and real Work allowance reconciliation: NOT YET VERIFIED.
- Keep private AED schema unexposed; no browser grants, SQL SECURITY DEFINER, schema migration, Production deployment, paid inference, or new monitoring pipeline.
