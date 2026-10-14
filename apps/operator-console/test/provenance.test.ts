import assert from "node:assert/strict";
import test from "node:test";

import { validateMetadataProvenance } from "../src/lib/schema/provenance";

test("metadata provenance requires a valid capture timestamp", () => {
  assert.throws(() => validateMetadataProvenance({ provider: "protected", schema: "public", capturedAt: "not-a-date" }));
});
