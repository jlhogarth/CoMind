import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../src/app/api/schema/route";

test("schema endpoint reports unavailable until protected provider is configured", async () => {
  const response = await GET();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, "schema_metadata_provider_unavailable");
});
