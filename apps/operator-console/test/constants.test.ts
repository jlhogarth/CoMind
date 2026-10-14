import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SCHEMA } from "../src/lib/schema/constants";

test("OC-001 discovery scope is public schema", () => {
  assert.equal(DEFAULT_SCHEMA, "public");
});
