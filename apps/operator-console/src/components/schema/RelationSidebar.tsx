import { Table2 } from "lucide-react";

import type { SchemaGraph } from "@/lib/schema/types";

export interface RelationSidebarProps {
  graph: SchemaGraph;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

export function RelationSidebar({ graph, selectedKey, onSelect }: RelationSidebarProps) {
  return (
    <nav aria-label="Database relations">
      {graph.relations.map((relation) => (
        <button
          type="button"
          key={relation.key}
          aria-current={selectedKey === relation.key ? "page" : undefined}
          onClick={() => onSelect?.(relation.key)}
        >
          <Table2 aria-hidden="true" size={16} />
          <span>{relation.name}</span>
          <small>{relation.kind}</small>
        </button>
      ))}
    </nav>
  );
}
