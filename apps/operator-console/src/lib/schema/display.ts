import type { SchemaRelation } from "./types";

export function relationDisplayName(relation: SchemaRelation): string {
  return relation.schema === "public" ? relation.name : `${relation.schema}.${relation.name}`;
}
