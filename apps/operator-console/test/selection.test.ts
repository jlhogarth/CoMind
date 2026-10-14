import assert from "node:assert/strict";
import test from "node:test";

import { canAddressRow } from "../src/lib/schema/selection";
import type { SchemaRelation } from "../src/lib/schema/types";

const relation: SchemaRelation = {
  schema: "public",
  name: "events",
  key: "public.events",
  kind: "table",
  columns: [{ name: "id", ordinalPosition: 1, dataType: "uuid", udtName: "uuid", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: true }],
  inboundForeignKeys: [],
  outboundForeignKeys: [],
};

test("rows are addressable when primary-key metadata exists", () => {
  assert.equal(canAddressRow(relation), true);
});
