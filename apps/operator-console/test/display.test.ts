import assert from "node:assert/strict";
import test from "node:test";

import { relationDisplayName } from "../src/lib/schema/display";
import type { SchemaRelation } from "../src/lib/schema/types";

const base: SchemaRelation = { schema: "public", name: "memories", key: "public.memories", kind: "table", columns: [], inboundForeignKeys: [], outboundForeignKeys: [] };

test("public relations use concise display names", () => {
  assert.equal(relationDisplayName(base), "memories");
});
