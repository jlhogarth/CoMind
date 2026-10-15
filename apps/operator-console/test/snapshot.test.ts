import assert from "node:assert/strict";
import test from "node:test";

import { snapshotFromGraph } from "../src/lib/schema/snapshot";

test("empty schema graph produces a provenance-bearing snapshot", () => {
  const snapshot = snapshotFromGraph({ relations: [], byKey: new Map() }, new Date("2026-10-14T00:00:00Z"));
  assert.equal(snapshot.source, "protected-provider");
  assert.equal(snapshot.capturedAt, "2026-10-14T00:00:00.000Z");
});
