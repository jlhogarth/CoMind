export interface DataGridProps {
  rows: Record<string, unknown>[];
}

function displayValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataGrid({ rows }: DataGridProps) {
  if (rows.length === 0) return <p>No visible rows.</p>;

  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return (
    <div role="region" aria-label="Relation data" tabIndex={0}>
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column}>{displayValue(row[column])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
