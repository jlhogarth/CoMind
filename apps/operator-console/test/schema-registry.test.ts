import assert from "node:assert/strict";
import test from "node:test";

import { buildSchemaGraph } from "../src/lib/schema/registry";
import type { RawSchemaMetadata } from "../src/lib/schema/types";

const fixture: RawSchemaMetadata = {
  relations: [
    {
      schema: "public",
      name: "children",
      kind: "table",
      columns: [
        { name: "parent_id", ordinalPosition: 2, dataType: "uuid", udtName: "uuid", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: false },
        { name: "id", ordinalPosition: 1, dataType: "uuid", udtName: "uuid", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: true },
      ],
    },
    {
      schema: "public",
      name: "parents",
      kind: "table",
      columns: [
        { name: "id", ordinalPosition: 1, dataType: "uuid", udtName: "uuid", nullable: false, defaultExpression: null, generated: false, identity: false, primaryKey: true },
      ],
    },
  ],
  foreignKeys: [
    {
      constraintName: "children_parent_id_fkey",
      sourceSchema: "public",
      sourceRelation: "children",
      sourceColumns: ["parent_id"],
      targetSchema: "public",
      targetRelation: "parents",
      targetColumns: ["id"],
      onDelete: "CASCADE",
      onUpdate: "NO ACTION",
    },
  ],
};

test("normalizes relations and discovers inbound/outbound relationships", () => {
  const graph = buildSchemaGraph(fixture);

  assert.deepEqual(graph.relations.map((relation) => relation.key), ["public.children", "public.parents"]);
  assert.deepEqual(graph.byKey.get("public.children")?.columns.map((column) => column.name), ["id", "parent_id"]);
  assert.equal(graph.byKey.get("public.children")?.outboundForeignKeys.length, 1);
  assert.equal(graph.byKey.get("public.parents")?.inboundForeignKeys.length, 1);
  assert.equal(graph.byKey.get("public.parents")?.inboundForeignKeys[0]?.onDelete, "CASCADE");
});

test("fails closed when foreign-key metadata references an undiscovered relation", () => {
  const invalid: RawSchemaMetadata = {
    ...fixture,
    relations: fixture.relations.filter((relation) => relation.name !== "parents"),
  };

  assert.throws(() => buildSchemaGraph(invalid), /undiscovered relation/);
});
