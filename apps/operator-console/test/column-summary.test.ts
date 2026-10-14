import assert from "node:assert/strict";
import test from "node:test";

import { ColumnSummary } from "../src/components/schema/ColumnSummary";

test("column summary component is available", () => {
  assert.equal(typeof ColumnSummary, "function");
});
