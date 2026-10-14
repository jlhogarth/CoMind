import type { SchemaRelation } from "@/lib/schema/types";

export function ColumnSummary({ relation }: { relation: SchemaRelation }) {
  return (
    <table>
      <thead><tr><th>Column</th><th>Type</th><th>Null</th><th>Key</th></tr></thead>
      <tbody>
        {relation.columns.map((column) => (
          <tr key={column.name}>
            <td>{column.name}</td>
            <td>{column.dataType}</td>
            <td>{column.nullable ? "yes" : "no"}</td>
            <td>{column.primaryKey ? "primary" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
