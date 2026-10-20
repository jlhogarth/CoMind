# CoMind Operator Console continuation

## Activity HUD pagination and filters

PR [#154](https://github.com/jlhogarth/CoMind/pull/154) remains open and draft on `activity-hud-test-001`. The last verified remote base before this slice was `9cd68fa0259554bdd19bd808a631f654fe2819ea`; this update must remain draft and unmerged.

The Activity HUD now paginates the bounded latest read locally with selectable page sizes of 10, 25, or 50. First, previous, next, and last controls report the visible range and current page. Search, state, source, owner, source-result, report-age, and sort changes reset to page one. Rows remain in the existing investigation-priority order unless the operator selects another sort.

The browser proof runs Chromium against the local app and intercepts the Test Supabase REST URL with 23 synthetic rows. It verifies navigation and disjoint pages, filtering and page reset, missing report-time filtering, and page counts. The browser proof does not contact Supabase. The separate Test REST integration was previously verified with five synthetic rows; this slice does not repeat a live Test read.

Pagination is client-side over at most 1,000 rows per read. A reached query cap remains visible; the page controls do not establish complete history, snapshot consistency, or a lossless feed. The dataset can change during refreshes. Source domains remain separate: no PM/RunBook/Foundry UUID, lane, decision, authorization, verification, or evidence relationships are inferred.

The issue #153 Data API scope discrepancy remains open: the existing Test GUI path uses `anon` SELECT on the synthetic wrapper, while the issue text says not to grant Data API access to `anon` or `authenticated`. Keep #154 draft until that boundary is reconciled. No production action is authorized or performed.

Next: read back exact-head workflow results and the browser screenshot artifact after publishing this change. Record exact implementation/documentation heads, run IDs, browser evidence, and remaining limits in the provenance file. Do not merge or mark the PR ready.
