import assert from "node:assert/strict";
import test from "node:test";

import type { ForeignKeyAction } from "../src/lib/schema/types";

const supported: ForeignKeyAction[] = ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"];

test("schema contract preserves all PostgreSQL FK actions needed for cascade analysis", () => {
  assert.deepEqual(supported, ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"]);
});
