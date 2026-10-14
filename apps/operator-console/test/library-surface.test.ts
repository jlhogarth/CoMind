import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeIdentifier, buildSchemaGraph, toOperatorConsoleError } from "../src/lib";

test("core Operator Console library exports are reachable", () => {
  assert.equal(typeof assertSafeIdentifier, "function");
  assert.equal(typeof buildSchemaGraph, "function");
  assert.equal(typeof toOperatorConsoleError, "function");
});
