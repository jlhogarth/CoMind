import assert from "node:assert/strict";
import test from "node:test";

import { normalizePagination } from "../src/lib/queries/pagination";

test("caps page size and normalizes invalid page values", () => {
  assert.deepEqual(normalizePagination(-4, 1000), { page: 1, pageSize: 100, from: 0, to: 99 });
});
