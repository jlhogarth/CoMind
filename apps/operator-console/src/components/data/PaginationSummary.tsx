export interface PaginationSummaryProps {
  page: number;
  pageSize: number;
  count: number | null;
}

export function PaginationSummary({ page, pageSize, count }: PaginationSummaryProps) {
  const first = (page - 1) * pageSize + 1;
  const last = count === null ? page * pageSize : Math.min(page * pageSize, count);
  return <p>{count === null ? `Rows ${first}-${last}` : `Rows ${first}-${last} of ${count}`}</p>;
}
