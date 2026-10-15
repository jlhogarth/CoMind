import assert from "node:assert/strict";
import test from "node:test";

import { validateFilters } from "../src/lib/queries/filters";

test("rejects unsafe filter column identifiers", () => {
  assert.throws(() => validateFilters([{ column: "id) or true", operator: "eq", value: "x" }]));
});
