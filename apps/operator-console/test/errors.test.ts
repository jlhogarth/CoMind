import assert from "node:assert/strict";
import test from "node:test";

import { toOperatorConsoleError } from "../src/lib/errors";

test("classifies RLS and permission failures without privilege escalation", () => {
  const result = toOperatorConsoleError(new Error("permission denied for table memories"));
  assert.equal(result.permissionRelated, true);
  assert.equal(result.title, "Access denied by database policy");
});
