import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeIdentifier } from "../src/lib/queries/identifiers";

test("accepts PostgreSQL-style unquoted identifiers", () => {
  assert.doesNotThrow(() => assertSafeIdentifier("archive_messages_2026"));
});

test("rejects expression-shaped input", () => {
  assert.throws(() => assertSafeIdentifier("id desc nulls last"));
});
