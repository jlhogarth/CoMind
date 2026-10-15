import type { RawSchemaMetadata, SchemaGraph } from "./types";

export interface SchemaSnapshot {
  capturedAt: string;
  source: "protected-provider";
  metadata: RawSchemaMetadata;
}

export function snapshotFromGraph(graph: SchemaGraph, capturedAt: Date): SchemaSnapshot {
  return {
    capturedAt: capturedAt.toISOString(),
    source: "protected-provider",
    metadata: {
      relations: graph.relations.map(({ key: _key, inboundForeignKeys: _inbound, outboundForeignKeys: _outbound, ...relation }) => relation),
      foreignKeys: graph.relations.flatMap((relation) => relation.outboundForeignKeys),
    },
  };
}
