import assert from "node:assert/strict";
import test from "node:test";

import { operatorConsoleCapabilities } from "../src/lib/schema/capabilities";

test("unverified live and destructive capabilities remain disabled", () => {
  assert.equal(operatorConsoleCapabilities.liveSchemaDiscovery, false);
  assert.equal(operatorConsoleCapabilities.liveReadOnlyExplorer, false);
  assert.equal(operatorConsoleCapabilities.mutations, false);
  assert.equal(operatorConsoleCapabilities.rawSql, false);
});
