import assert from "node:assert/strict";
import test from "node:test";

import { SchemaUnavailable } from "../src/components/schema/SchemaUnavailable";

test("schema unavailable state is present", () => {
  assert.equal(typeof SchemaUnavailable, "function");
});
