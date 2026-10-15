import type { SchemaGraph, SchemaRelation } from "./types";

export function getRelation(graph: SchemaGraph, key: string): SchemaRelation {
  const relation = graph.byKey.get(key);
  if (!relation) throw new Error(`Unknown relation: ${key}`);
  return relation;
}

export function relatedRelationKeys(relation: SchemaRelation): string[] {
  return Array.from(
    new Set([
      ...relation.outboundForeignKeys.map((fk) => `${fk.targetSchema}.${fk.targetRelation}`),
      ...relation.inboundForeignKeys.map((fk) => `${fk.sourceSchema}.${fk.sourceRelation}`),
    ]),
  ).sort();
}
