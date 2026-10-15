import assert from "node:assert/strict";
import test from "node:test";

import { CapabilityStatus } from "../src/components/CapabilityStatus";

test("capability status component is available", () => {
  assert.equal(typeof CapabilityStatus, "function");
});
