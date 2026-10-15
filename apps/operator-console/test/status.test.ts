import assert from "node:assert/strict";
import test from "node:test";
import type { SchemaProviderStatus } from "../src/lib/schema/status";

test("schema provider status can represent fail-closed unavailability", () => {
  const status: SchemaProviderStatus = { state: "unavailable", reason: "not configured" };
  assert.equal(status.state, "unavailable");
});
