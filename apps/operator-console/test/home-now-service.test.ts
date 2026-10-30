import assert from "node:assert/strict";
import test from "node:test";

import type { ActivityHudRow } from "../src/lib/activity-hud/model";
import type { ContinuousExcellenceSnapshot } from "../src/lib/continuous-excellence/service";
import { NOW_CANDIDATE_LIMIT } from "../src/lib/home/now-model";
import { composeNowSnapshot } from "../src/lib/home/now-service";

function activity(index: number): ActivityHudRow {
  return {
    activity_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    activity_key: `HOME-TEST-${index}`,
    source_system: "github",
    source_ref: `https://github.com/jlhogarth/CoMind/issues/${index}`,
    title: `Attention ${index}`,
    owner_label: null,
    started_at: "2026-10-30T08:00:00Z",
    expected_deadline_at: null,
    stale_after_seconds: 0,
    latest_observation_id: null,
    latest_event_type: "status",
    last_reported_status: "blocked",
    last_source_event_ref: null,
    last_source_occurred_at: "2026-10-30T09:00:00Z",
    last_observed_at: "2026-10-30T09:00:00Z",
    last_observation_summary: "Blocked by governed test fixture.",
    last_evidence: null,
    hud_state: "blocked",
    evidence_based_resolution: null,
    has_terminal_source_evidence: false,
    is_synthetic: false,
    coverage_limit: "Bounded fixture.",
  };
}

function ceSnapshot(overrides: Partial<ContinuousExcellenceSnapshot["summary"]> = {}): ContinuousExcellenceSnapshot {
  return {
    summary: {
      generated_at: "2026-10-30T09:30:00Z",
      signal_count: 0,
      actionable_backlog_count: 0,
      recovery_interrupt_count: 0,
      current_capsule_count: 0,
      recovery_ready_count: 0,
      recovery_attention_count: 0,
      improvement_count: 0,
      validated_improvement_count: 0,
      latest_signal_at: null,
      latest_capsule_at: null,
      ...overrides,
    },
    states: [],
  };
}

test("reports partial coverage when governed sources succeed but approval and cost adapters are not registered", async () => {
  const snapshot = await composeNowSnapshot(
    {
      readActivity: async () => [activity(1)],
      readContinuousExcellence: async () => ceSnapshot({ actionable_backlog_count: 2 }),
    },
    new Date("2026-10-30T10:00:00Z"),
  );

  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.generated_at, "2026-10-30T10:00:00.000Z");
  assert.equal(snapshot.candidates.length, 2);
  assert.deepEqual(
    snapshot.sources.filter((source) => source.availability === "unavailable").map((source) => source.source_id),
    ["approvals", "cost_alerts"],
  );
  assert.equal(snapshot.sources.find((source) => source.source_id === "approvals")?.coverage, "adapter_not_registered");
});

test("preserves source degradation instead of converting a failed Activity read into zero", async () => {
  const snapshot = await composeNowSnapshot(
    {
      readActivity: async () => { throw new Error("sensitive upstream detail"); },
      readContinuousExcellence: async () => ceSnapshot({ recovery_attention_count: 1 }),
    },
    new Date("2026-10-30T10:00:00Z"),
  );

  assert.equal(snapshot.status, "partial");
  const activitySource = snapshot.sources.find((source) => source.source_id === "activity");
  assert.equal(activitySource?.availability, "unavailable");
  assert.doesNotMatch(JSON.stringify(snapshot), /sensitive upstream detail/);
  assert.equal(snapshot.candidates.some((candidate) => candidate.source_id === "continuity"), true);
});

test("returns unavailable when every source with a registered read adapter fails", async () => {
  const snapshot = await composeNowSnapshot(
    {
      readActivity: async () => { throw new Error("activity unavailable"); },
      readContinuousExcellence: async () => { throw new Error("ce unavailable"); },
    },
    new Date("2026-10-30T10:00:00Z"),
  );

  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.candidates.length, 0);
  assert.equal(snapshot.sources.every((source) => source.availability === "unavailable"), true);
});

test("hard bounds the composed attention list", async () => {
  const rows = Array.from({ length: NOW_CANDIDATE_LIMIT + 25 }, (_, index) => activity(index + 1));
  const snapshot = await composeNowSnapshot(
    {
      readActivity: async () => rows,
      readContinuousExcellence: async () => ceSnapshot(),
    },
    new Date("2026-10-30T10:00:00Z"),
  );

  assert.equal(snapshot.candidate_limit, NOW_CANDIDATE_LIMIT);
  assert.equal(snapshot.candidates.length, NOW_CANDIDATE_LIMIT);
});
