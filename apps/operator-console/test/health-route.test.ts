import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../src/app/api/health/route";

test("health endpoint identifies OC-001 service", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.service, "comind-operator-console");
  assert.equal(body.status, "ok");
});
