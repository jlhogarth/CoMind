import assert from "node:assert/strict";
import test from "node:test";

import { validateSort } from "../src/lib/queries/sort";

test("rejects expression-shaped sort columns", () => {
  assert.throws(() => validateSort({ column: "created_at desc", ascending: true }));
});
