import assert from "node:assert/strict";
import test from "node:test";

import { createNowGet } from "../src/app/api/home/now/route";
import type { NowSnapshot } from "../src/lib/home/now-model";

function snapshot(status: NowSnapshot["status"]): NowSnapshot {
  return {
    generated_at: "2026-10-30T10:00:00.000Z",
    status,
    candidates: [],
    sources: [
      {
        source_id: "approvals",
        availability: "unavailable",
        coverage: "adapter_not_registered",
        observed_at: null,
        detail: "No accepted Home-safe approval read adapter is registered in HOME-002.",
      },
    ],
    candidate_limit: 50,
    coverage_limit: "Bounded governed source adapters only.",
  };
}

test("returns partial snapshots as a no-store successful response", async () => {
  const response = await createNowGet(async () => snapshot("partial"))();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const payload = await response.json() as NowSnapshot;
  assert.equal(payload.status, "partial");
});

test("returns HTTP 503 when all registered Now sources are unavailable", async () => {
  const response = await createNowGet(async () => snapshot("unavailable"))();
  assert.equal(response.status, 503);
  const payload = await response.json() as NowSnapshot;
  assert.equal(payload.status, "unavailable");
});

test("redacts unexpected server errors", async () => {
  const response = await createNowGet(async () => {
    throw new Error("database password and private upstream detail");
  })();
  assert.equal(response.status, 500);
  const text = await response.text();
  assert.doesNotMatch(text, /database password|private upstream detail/);
  assert.match(text, /CoMind Home Now projection is unavailable/);
});
