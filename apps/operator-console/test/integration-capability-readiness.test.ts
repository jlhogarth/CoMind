import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capabilityObservations,
  capabilityPreflight,
  isSafeCapabilityInventory,
  type CapabilityObservation,
} from "../src/lib/integration-gateway/capabilities";

test("dated observations never turn a historical proof into current authorization", () => {
  assert.equal(isSafeCapabilityInventory(capabilityObservations), true);
  for (const item of capabilityObservations) {
    const result = capabilityPreflight(item);
    assert.equal(result.live_check_required, true);
    assert.equal(result.can_authorize_action, false);
  }
  assert.equal(capabilityObservations.find((item) => item.id === "gci-private-site-dispatch")?.proof, "BLOCKED");
  assert.equal(capabilityObservations.find((item) => item.id === "google-cloud-founder-admin")?.proof, "NOT_VERIFIED");
});

test("a profile read cannot be represented as a verified write", () => {
  const gmail = capabilityObservations.find((item) => item.id === "gmail-founder-profile");
  assert.ok(gmail);
  assert.equal(gmail.proof, "PROFILE_ONLY");
  assert.equal(capabilityPreflight(gmail).can_authorize_action, false);
});

test("reject missing action evidence, duplicate IDs and secret fields", () => {
  const action = capabilityObservations.find((item) => item.proof === "ACTION_VERIFIED");
  assert.ok(action);
  assert.equal(isSafeCapabilityInventory([{ ...action, evidence: null }]), false);
  assert.equal(isSafeCapabilityInventory([action, action]), false);
  assert.equal(isSafeCapabilityInventory([{ ...action, refresh_token: "redacted" } as CapabilityObservation]), false);
});
