import type { SchemaRelation } from "../schema/types";

export function searchableTextColumns(relation: SchemaRelation): string[] {
  return relation.columns
    .filter((column) => ["text", "character varying", "character"].includes(column.dataType))
    .map((column) => column.name);
}
