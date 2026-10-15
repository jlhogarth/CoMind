export type RelationKind = "table" | "view";

export type ForeignKeyAction =
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT"
  | "RESTRICT"
  | "NO ACTION";

export interface ColumnMetadata {
  name: string;
  ordinalPosition: number;
  dataType: string;
  udtName: string;
  nullable: boolean;
  defaultExpression: string | null;
  generated: boolean;
  identity: boolean;
  primaryKey: boolean;
}

export interface ForeignKeyMetadata {
  constraintName: string;
  sourceSchema: string;
  sourceRelation: string;
  sourceColumns: string[];
  targetSchema: string;
  targetRelation: string;
  targetColumns: string[];
  onDelete: ForeignKeyAction;
  onUpdate: ForeignKeyAction;
}

export interface RelationMetadata {
  schema: string;
  name: string;
  kind: RelationKind;
  columns: ColumnMetadata[];
}

export interface RawSchemaMetadata {
  relations: RelationMetadata[];
  foreignKeys: ForeignKeyMetadata[];
}

export interface SchemaRelation extends RelationMetadata {
  key: string;
  inboundForeignKeys: ForeignKeyMetadata[];
  outboundForeignKeys: ForeignKeyMetadata[];
}

export interface SchemaGraph {
  relations: SchemaRelation[];
  byKey: ReadonlyMap<string, SchemaRelation>;
}
