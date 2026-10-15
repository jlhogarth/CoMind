import type { ForeignKeyAction, RawSchemaMetadata, RelationKind } from "./types";

const relationKinds = new Set<RelationKind>(["table", "view"]);
const actions = new Set<ForeignKeyAction>(["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return value;
}

export function validateSchemaMetadata(value: unknown): RawSchemaMetadata {
  const root = object(value, "metadata");
  if (!Array.isArray(root.relations) || !Array.isArray(root.foreignKeys)) {
    throw new Error("metadata must contain relations and foreignKeys arrays");
  }

  const relations = root.relations.map((raw, relationIndex) => {
    const relation = object(raw, `relations[${relationIndex}]`);
    const kind = string(relation.kind, `relations[${relationIndex}].kind`) as RelationKind;
    if (!relationKinds.has(kind)) throw new Error(`Unsupported relation kind: ${kind}`);
    if (!Array.isArray(relation.columns)) throw new Error(`relations[${relationIndex}].columns must be an array`);

    return {
      schema: string(relation.schema, `relations[${relationIndex}].schema`),
      name: string(relation.name, `relations[${relationIndex}].name`),
      kind,
      columns: relation.columns.map((rawColumn, columnIndex) => {
        const column = object(rawColumn, `column ${columnIndex}`);
        const ordinalPosition = column.ordinalPosition;
        if (!Number.isInteger(ordinalPosition) || (ordinalPosition as number) < 1) throw new Error("column ordinalPosition must be a positive integer");
        for (const flag of ["nullable", "generated", "identity", "primaryKey"] as const) {
          if (typeof column[flag] !== "boolean") throw new Error(`column ${flag} must be boolean`);
        }
        if (column.defaultExpression !== null && typeof column.defaultExpression !== "string") throw new Error("column defaultExpression must be string or null");
        return {
          name: string(column.name, "column.name"),
          ordinalPosition: ordinalPosition as number,
          dataType: string(column.dataType, "column.dataType"),
          udtName: string(column.udtName, "column.udtName"),
          nullable: column.nullable as boolean,
          defaultExpression: column.defaultExpression as string | null,
          generated: column.generated as boolean,
          identity: column.identity as boolean,
          primaryKey: column.primaryKey as boolean,
        };
      }),
    };
  });

  const foreignKeys = root.foreignKeys.map((raw, index) => {
    const fk = object(raw, `foreignKeys[${index}]`);
    const onDelete = string(fk.onDelete, "foreignKey.onDelete") as ForeignKeyAction;
    const onUpdate = string(fk.onUpdate, "foreignKey.onUpdate") as ForeignKeyAction;
    if (!actions.has(onDelete) || !actions.has(onUpdate)) throw new Error("Unsupported foreign-key action");
    return {
      constraintName: string(fk.constraintName, "foreignKey.constraintName"),
      sourceSchema: string(fk.sourceSchema, "foreignKey.sourceSchema"),
      sourceRelation: string(fk.sourceRelation, "foreignKey.sourceRelation"),
      sourceColumns: strings(fk.sourceColumns, "foreignKey.sourceColumns"),
      targetSchema: string(fk.targetSchema, "foreignKey.targetSchema"),
      targetRelation: string(fk.targetRelation, "foreignKey.targetRelation"),
      targetColumns: strings(fk.targetColumns, "foreignKey.targetColumns"),
      onDelete,
      onUpdate,
    };
  });

  return { relations, foreignKeys };
}
