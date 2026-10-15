import type { SchemaRelation } from "./types";

export function primaryKeyColumns(relation: SchemaRelation): string[] {
  return relation.columns.filter((column) => column.primaryKey).map((column) => column.name);
}

export function canAddressRow(relation: SchemaRelation): boolean {
  return primaryKeyColumns(relation).length > 0;
}
