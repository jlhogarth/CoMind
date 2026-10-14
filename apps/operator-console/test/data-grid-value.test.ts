import assert from "node:assert/strict";
import test from "node:test";

import { DataGrid } from "../src/components/data/DataGrid";

test("data grid component is available for schema-driven row rendering", () => {
  assert.equal(typeof DataGrid, "function");
});
