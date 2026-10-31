import assert from "node:assert/strict";
import test from "node:test";

import type { ActivityHudRow, HudState } from "../src/lib/activity-hud/model";
import {
  activityAttentionCandidates,
  continuousExcellenceAttentionCandidates,
  rankNowCandidates,
} from "../src/lib/home/now-model";
import type { ContinuousExcellenceSnapshot } from "../src/lib/continuous-excellence/service";

function activity(state: HudState, id: string, synthetic = false): ActivityHudRow {
  return {
    activity_id: id,
    activity_key: `work-${id}`,
    source_system: "github",
    source_ref: `https://github.com/jlhogarth/CoMind/issues/${id}`,
    title: `Work ${id}`,
    owner_label: "Joseph Hogarth",
    started_at: "2026-10-30T08:00:00Z",
    expected_deadline_at: null,
    stale_after_seconds: 0,
    latest_observation_id: `observation-${id}`,
    latest_event_type: "status",
    last_reported_status: state,
    last_source_event_ref: `https://github.com/jlhogarth/CoMind/issues/${id}#event`,
    last_source_occurred_at: "2026-10-30T09:00:00Z",
    last_observed_at: "2026-10-30T09:00:00Z",
    last_observation_summary: `${state} evidence`,
    last_evidence: { private_detail: "must not be copied" },
    hud_state: state,
    evidence_based_resolution: state === "failed" ? "failed" : null,
    has_terminal_source_evidence: state === "failed",
    is_synthetic: synthetic,
    coverage_limit: "Bounded operational projection.",
  };
}

const ceSnapshot: ContinuousExcellenceSnapshot = {
  summary: {
    generated_at: "2026-10-30T09:30:00Z",
    signal_count: 7,
    actionable_backlog_count: 3,
    recovery_interrupt_count: 1,
    current_capsule_count: 2,
    recovery_ready_count: 1,
    recovery_attention_count: 1,
    improvement_count: 4,
    validated_improvement_count: 2,
    latest_signal_at: "2026-10-30T09:20:00Z",
    latest_capsule_at: "2026-10-30T09:25:00Z",
  },
  states: [],
};

test("maps material operational Activity states and excludes terminal success and synthetic rows", () => {
  const rows = [
    activity("blocked", "1"),
    activity("awaiting_review", "2"),
    activity("running", "3"),
    activity("deferred", "4"),
    activity("failed", "5"),
    activity("completed", "6"),
    activity("cancelled", "7"),
    activity("blocked", "8", true),
  ];

  const candidates = activityAttentionCandidates(rows);
  assert.deepEqual(
    candidates.map((candidate) => candidate.source_state),
    ["blocked", "awaiting_review", "running", "deferred", "failed"],
  );
  assert.equal(candidates.some((candidate) => candidate.candidate_id === "activity:8"), false);
  assert.equal(JSON.stringify(candidates).includes("private_detail"), false);
});

test("creates only aggregate CE and continuity candidates from aggregate operator fields", () => {
  const candidates = continuousExcellenceAttentionCandidates(ceSnapshot);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.candidate_id, "continuous-excellence:actionable-backlog");
  assert.equal(candidates[1]?.candidate_id, "continuity:recovery-attention");
  assert.match(candidates[0]?.title ?? "", /3 Continuous Excellence signals/);
  assert.match(candidates[1]?.title ?? "", /1 continuity capsule/);
});

test("ranks deterministically by priority, observation time, then stable candidate id", () => {
  const candidates = activityAttentionCandidates([
    activity("running", "b"),
    activity("blocked", "c"),
    activity("blocked", "a"),
  ]);

  const first = rankNowCandidates(candidates).map((candidate) => candidate.candidate_id);
  const second = rankNowCandidates([...candidates].reverse()).map((candidate) => candidate.candidate_id);
  assert.deepEqual(first, ["activity:a", "activity:c", "activity:b"]);
  assert.deepEqual(second, first);
});
