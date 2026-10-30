import assert from "node:assert/strict";
import test from "node:test";
import { containsCredentialKey, deriveManagementLaneState, managementCounts, type ManagementLane } from "../src/lib/management-plane/model";

function lane(overrides: Partial<ManagementLane> = {}): ManagementLane {
  return {
    work_key: "GER-003", title: "Test lane", status: "in_progress", priority: "high", area: "GER", owner: "Joseph",
    current_summary: "Working", last_event_at: "2026-10-30T17:00:00Z", latest_event_type: "action", latest_outcome: "pending",
    latest_result: null, next_action: "Continue", latest_actor: "agent", latest_occurred_at: "2026-10-30T17:00:00Z",
    production_change: false, ...overrides,
  };
}

test("derives only evidence-supported management states", () => {
  assert.equal(deriveManagementLaneState(lane()), "WORKING");
  assert.equal(deriveManagementLaneState(lane({ status: "blocked" })), "BLOCKED");
  assert.equal(deriveManagementLaneState(lane({ latest_event_type: "recovery" })), "RECOVERY");
  assert.equal(deriveManagementLaneState(lane({ github: { pull_request: "9", checks_success: "4", checks_total: "5" } })), "WAITING_CI");
  assert.equal(deriveManagementLaneState(lane({ status: "review", github: { pull_request: "9", checks_success: "5", checks_total: "5", mergeable: true, freshness: "reconciled" } })), "READY_TO_MERGE");
  assert.equal(deriveManagementLaneState(lane({ status: "review", github: { pull_request: "9", checks_success: "5", checks_total: "5" } })), "REVIEW");
  assert.equal(deriveManagementLaneState(lane({ next_action: "AUTH_REQUIRED: reconnect provider" })), "AUTH_REQUIRED");
  assert.equal(deriveManagementLaneState(lane({ next_action: "human decision required for Production" })), "HUMAN_STOP");
});

test("credential key detection is recursive but does not reject authorization metadata", () => {
  assert.equal(containsCredentialKey({ authority: { authorization_type: "delegation" } }), false);
  assert.equal(containsCredentialKey({ nested: [{ access_token: "secret" }] }), true);
  assert.equal(containsCredentialKey({ service_role_key: "secret" }), true);
});

test("management counts separate wait, recovery, and blocks", () => {
  const counts = managementCounts([
    lane(),
    lane({ work_key: "A", github: { pull_request: "1", checks_success: "1", checks_total: "2" } }),
    lane({ work_key: "B", latest_event_type: "recovery" }),
    lane({ work_key: "C", status: "blocked" }),
    lane({ work_key: "D", status: "done" }),
  ]);
  assert.equal(counts.total, 5);
  assert.equal(counts.waitingCi, 1);
  assert.equal(counts.recovery, 1);
  assert.equal(counts.blocked, 1);
});
