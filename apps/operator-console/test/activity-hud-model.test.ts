import assert from "node:assert/strict";
import test from "node:test";
import { formatElapsed, hasNoTerminalReturn, needsInvestigation, paginateActivityRows, sortActivityRows, type ActivityHudRow } from "../src/lib/activity-hud/model";

const sample = (activity_key: string, hud_state: ActivityHudRow["hud_state"], started_at: string, last_observed_at: string | null, terminal = false): ActivityHudRow => ({
  activity_id: activity_key,
  activity_key,
  source_system: "synthetic_test",
  source_ref: `synthetic://${activity_key}`,
  title: activity_key,
  owner_label: null,
  started_at,
  expected_deadline_at: null,
  stale_after_seconds: 60,
  latest_observation_id: null,
  latest_event_type: null,
  last_reported_status: null,
  last_source_event_ref: null,
  last_source_occurred_at: last_observed_at,
  last_observed_at,
  last_observation_summary: null,
  last_evidence: [],
  hud_state,
  evidence_based_resolution: terminal ? hud_state as "completed" | "failed" | "cancelled" : null,
  has_terminal_source_evidence: terminal,
  is_synthetic: true,
  coverage_limit: "Synthetic test fixture.",
});

const date = (minute: number) => new Date(Date.UTC(2026, 9, 19, 20, minute)).toISOString();

test("investigation sort puts deadline overruns and stale no-return work first", () => {
  const rows = [
    sample("done", "completed", date(1), date(2), true),
    sample("active", "running", date(0), date(5)),
    sample("stale-newer", "stale_unknown", date(10), date(11)),
    sample("deadline", "deadline_exceeded", date(30), date(35)),
    sample("stale-oldest", "stale_unknown", date(1), date(4)),
  ];
  assert.deepEqual(sortActivityRows(rows, "investigation").map((row) => row.activity_key), [
    "deadline", "stale-oldest", "stale-newer", "active", "done",
  ]);
});

test("longest-wait ordering uses last source observation, falling back to start", () => {
  const rows = [
    sample("recent-observation", "running", date(1), date(9)),
    sample("never-observed", "unknown", date(2), null),
    sample("old-observation", "stale_unknown", date(0), date(3)),
  ];
  assert.deepEqual(sortActivityRows(rows, "longest_wait").map((row) => row.activity_key), [
    "never-observed", "old-observation", "recent-observation",
  ]);
});

test("no-return and investigation labels respect source terminal evidence", () => {
  const stale = sample("stale", "stale_unknown", date(0), date(1));
  const failed = sample("failed", "failed", date(0), date(1), true);
  assert.equal(hasNoTerminalReturn(stale), true);
  assert.equal(needsInvestigation(stale), true);
  assert.equal(hasNoTerminalReturn(failed), false);
  assert.equal(needsInvestigation(failed), true);
});

test("elapsed labels stay bounded and explicitly handle missing source observations", () => {
  const now = Date.UTC(2026, 9, 19, 20, 10);
  assert.equal(formatElapsed(new Date(now - 90_000).toISOString(), now), "1m ago");
  assert.equal(formatElapsed(null, now), "No source observation");
});

test("paginates the filtered bounded result and clamps page and page size", () => {
  const rows = Array.from({ length: 23 }, (_, index) => `activity-${index + 1}`);
  assert.deepEqual(paginateActivityRows(rows, 2, 10), {
    items: rows.slice(10, 20), page: 2, pageSize: 10, total: 23, pageCount: 3, firstItem: 11, lastItem: 20,
  });
  assert.equal(paginateActivityRows(rows, 99, 10).page, 3);
  assert.equal(paginateActivityRows(rows, 1, 7).pageSize, 25);
  assert.deepEqual(paginateActivityRows([], 1, 10), {
    items: [], page: 1, pageSize: 10, total: 0, pageCount: 1, firstItem: 0, lastItem: 0,
  });
});
