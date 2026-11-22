import assert from "node:assert/strict";
import test from "node:test";
import { buildCbeControlStatus, CbeControlValidationError, parseCbeControlRequest, safeEndpointOrigin } from "../src/lib/cbe-control/model";
import type { ManagementPlaneSnapshot } from "../src/lib/management-plane/model";

function snapshot(): ManagementPlaneSnapshot {
  return {
    generated_at: "2026-11-01T00:00:00Z",
    coverage_limit: "test",
    authority: { active: true, authority_level: "L4A", production_authority: false },
    blockers: [], controllers: [],
    lanes: [{
      work_key: "CBE-AUTH-001", title: "Browser authentication", status: "in_progress", priority: "high", area: "CBE", owner: "Joseph",
      current_summary: "Profile bootstrap", last_event_at: "2026-11-01T00:00:00Z", latest_event_type: "action", latest_outcome: "pending",
      latest_result: null, next_action: "AUTH_REQUIRED: open human login", latest_actor: "agent", latest_occurred_at: "2026-11-01T00:00:00Z", production_change: false,
    }],
  };
}

test("control status fails closed when no execution adapter is configured", () => {
  const status = buildCbeControlStatus(snapshot(), { configured: false });
  assert.equal(status.execution_adapter.configured, false);
  assert.equal(status.production_change, false);
  assert.ok(status.actions.every((action) => action.available === false));
  assert.ok(status.actions.every((action) => action.state === "UNAVAILABLE"));
});

test("configured adapter exposes bounded Development/Test actions and explicit auth state", () => {
  const status = buildCbeControlStatus(snapshot(), { configured: true, endpointOrigin: "https://cbe.example.test" });
  assert.equal(status.actions.find((action) => action.action === "open_auth")?.available, true);
  assert.equal(status.actions.find((action) => action.action === "wake_conversation")?.requires_work_key, true);
  assert.equal(status.execution_adapter.endpoint_origin, "https://cbe.example.test");
});

test("request parser rejects unknown fields and implicit lane targets", () => {
  assert.throws(() => parseCbeControlRequest({ action: "wake_conversation" }), CbeControlValidationError);
  assert.throws(() => parseCbeControlRequest({ action: "start_browser", production: true }), CbeControlValidationError);
  assert.deepEqual(parseCbeControlRequest({ action: "retry_recovery", work_key: "AED-001" }), { action: "retry_recovery", work_key: "AED-001", recovery_id: undefined });
});

test("endpoint status exposes origin only", () => {
  assert.equal(safeEndpointOrigin("https://runtime.example.test/control?token=secret"), "https://runtime.example.test");
  assert.equal(safeEndpointOrigin("not a url"), null);
});
