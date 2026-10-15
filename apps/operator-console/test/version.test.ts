import assert from "node:assert/strict";
import test from "node:test";

import { SCHEMA_CONTRACT_VERSION } from "../src/lib/schema/version";

test("schema contract starts at version one", () => {
  assert.equal(SCHEMA_CONTRACT_VERSION, 1);
});
