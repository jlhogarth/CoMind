import type {
  ForeignKeyMetadata,
  RawSchemaMetadata,
  SchemaGraph,
  SchemaRelation,
} from "./types";

export function relationKey(schema: string, relation: string): string {
  return `${schema}.${relation}`;
}

function compareForeignKeys(a: ForeignKeyMetadata, b: ForeignKeyMetadata): number {
  return a.constraintName.localeCompare(b.constraintName);
}

export function buildSchemaGraph(metadata: RawSchemaMetadata): SchemaGraph {
  const relations = [...metadata.relations]
    .sort((a, b) => relationKey(a.schema, a.name).localeCompare(relationKey(b.schema, b.name)))
    .map<SchemaRelation>((relation) => ({
      ...relation,
      key: relationKey(relation.schema, relation.name),
      columns: [...relation.columns].sort((a, b) => a.ordinalPosition - b.ordinalPosition),
      inboundForeignKeys: [],
      outboundForeignKeys: [],
    }));

  const mutableByKey = new Map(relations.map((relation) => [relation.key, relation]));

  for (const foreignKey of metadata.foreignKeys) {
    const sourceKey = relationKey(foreignKey.sourceSchema, foreignKey.sourceRelation);
    const targetKey = relationKey(foreignKey.targetSchema, foreignKey.targetRelation);
    const source = mutableByKey.get(sourceKey);
    const target = mutableByKey.get(targetKey);

    if (!source || !target) {
      throw new Error(
        `Foreign key ${foreignKey.constraintName} references an undiscovered relation: ${sourceKey} -> ${targetKey}`,
      );
    }

    source.outboundForeignKeys.push(foreignKey);
    target.inboundForeignKeys.push(foreignKey);
  }

  for (const relation of relations) {
    relation.inboundForeignKeys.sort(compareForeignKeys);
    relation.outboundForeignKeys.sort(compareForeignKeys);
  }

  return {
    relations,
    byKey: new Map(relations.map((relation) => [relation.key, relation])),
  };
}
