import assert from "node:assert/strict";
import test from "node:test";

import { searchableTextColumns } from "../src/lib/queries/search";
import type { SchemaRelation } from "../src/lib/schema/types";

const relation: SchemaRelation = {
  schema: "public", name: "items", key: "public.items", kind: "table", inboundForeignKeys: [], outboundForeignKeys: [],
  columns: [
    { name: "id", ordinalPosition: 1, dataType: "uuid", udtName: "uuid", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: true },
    { name: "title", ordinalPosition: 2, dataType: "text", udtName: "text", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: false },
  ],
};

test("global search planning only selects textual columns", () => {
  assert.deepEqual(searchableTextColumns(relation), ["title"]);
});
