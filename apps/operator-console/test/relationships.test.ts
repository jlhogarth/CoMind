import assert from "node:assert/strict";
import test from "node:test";

import { getRelation } from "../src/lib/schema/relationships";
import type { SchemaGraph } from "../src/lib/schema/types";

test("unknown relation lookup fails visibly", () => {
  const graph: SchemaGraph = { relations: [], byKey: new Map() };
  assert.throws(() => getRelation(graph, "public.missing"), /Unknown relation/);
});
