import assert from "node:assert/strict";
import test from "node:test";

import { assertSupportedSchema } from "../src/lib/schema/scope";

test("non-public schema is outside OC-001", () => {
  assert.throws(() => assertSupportedSchema("auth"), /Unsupported schema/);
});
