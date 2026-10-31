# HOME-002 Governed Now Read Model

Issue: #366
Parent contract: `COMIND-HOME-IA-V1`
Production activation: excluded

## Purpose

HOME-002 implements the first executable successor to HOME-001: a server-side `Now` read model that composes bounded attention from already governed owner projections without creating a Home database, attention ledger, or new source of truth.

HOME-002 deliberately does not redesign the CoMind Home page. The accepted HOME-001 sequence assigns shell/navigation and Now presentation to HOME-003 after this read model is accepted.

## Governing boundary

Home may derive ranking and presentation. It may not manufacture truth.

Every emitted candidate therefore retains:

- source family and source system;
- source reference;
- source state;
- observation time;
- source-specific freshness semantics;
- authority state when supported by the source;
- evidence or source reference where available;
- governed action destination;
- coverage limitation.

The response also reports per-source availability. An unavailable source never becomes a zero count or healthy state.

## Source adapters

### Activity

HOME-002 extracts the accepted HUD-REAL server reader from the existing Activity API route into `src/lib/activity-hud/server.ts`. Both `/api/activity` and Home use the same capability-gated RPC path.

The reusable reader preserves:

- Test-project assertion;
- server-only Activity capability;
- publishable Supabase key as the bounded RPC transport identity;
- 1,000-row upstream hard bound;
- upstream payload validation;
- secret/error-body redaction at API boundaries.

`Now` accepts only operational Activity scope. Synthetic rows are rejected by the candidate mapper even if supplied to the pure model in a test.

Material states currently mapped to attention are:

1. `deadline_exceeded`
2. `stale_unknown`
3. `unknown`
4. `cancellation_requested`
5. `blocked`
6. `failed`
7. `awaiting_review`
8. `waiting_external`
9. `running`
10. `deferred`
11. `queued`

`completed` and `cancelled` are not attention merely because the records exist.

### Continuous Excellence

HOME-002 reuses the accepted Continuous Excellence trusted-perimeter client and operator summary. It does not query CE-owned private tables directly.

If `actionable_backlog_count` is positive, Home emits one aggregate candidate. It does not synthesize one candidate per signal because individual signal records are not part of this accepted read path.

### Continuity

Continuity uses only the recovery fields already exposed by the accepted Continuous Excellence operator summary. A positive `recovery_attention_count` may emit one aggregate candidate bound to `comind.v_ce_current_continuity_capsule`.

The Home model does not invent capsule IDs, text, causes, or next actions that the aggregate projection did not supply.

### Approvals

HOME-001 identifies Foundry authorization requests as an eventual `Now` source. HOME-002 found no already accepted Home-safe read adapter for that source.

The source is therefore returned as:

- availability: `unavailable`;
- coverage: `adapter_not_registered`.

This is intentional fail-closed behavior. HOME-002 does not widen database grants or reuse administrative paths merely to show an approval count.

### Cost alerts

The same rule applies to `public.comind_cost_alerts`. The table exists, but table existence is not equivalent to an accepted Home read contract. HOME-002 reports the adapter as unavailable rather than claiming zero alerts.

## Overall status

The read model returns one of three states:

- `complete`: every registered source is available;
- `partial`: at least one source is available and at least one source is unavailable;
- `unavailable`: no registered source can provide governed coverage.

Because approval and cost adapters are intentionally not registered in HOME-002, successful initial runtime results are expected to be `partial`. That is a truthful implementation state, not an error to hide.

The `/api/home/now` route returns HTTP 503 when the entire read model is unavailable. Partial coverage returns HTTP 200 with explicit degraded source entries.

## Ranking

Ranking is deterministic derived presentation logic. Lower numeric priority is more urgent. Equivalent candidates are ordered by latest observation time, then stable candidate identity.

The ranking does not mutate source state or create durable priority records.

The output is hard-bounded to 50 candidates even though the Activity source itself permits up to 1,000 bounded rows.

## Security

HOME-002 creates no new browser credential and no database grant.

The browser sees only the bounded `/api/home/now` response. It never receives:

- `OPERATOR_CONSOLE_ACTIVITY_CAPABILITY`;
- `SUPABASE_SECRET_KEY`;
- raw database errors;
- raw upstream error bodies;
- CE private-table access;
- Activity `last_evidence` payloads.

Unexpected route errors are reduced to a generic unavailable response.

## No new source of truth

HOME-002 adds no schema, table, view, persistence layer, cache, or attention event history.

Stable `candidate_id` values are deterministic projection identities only. They do not establish canonical identity outside the current response.

## Recovery

Revert the HOME-002 repository commits. No database, credential, grant, deployment, or Production rollback is required.
