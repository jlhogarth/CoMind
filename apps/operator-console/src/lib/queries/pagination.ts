export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const normalizedPage = Math.max(1, Math.trunc(page));
  const normalizedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize)));
  const from = (normalizedPage - 1) * normalizedPageSize;
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    from,
    to: from + normalizedPageSize - 1,
  };
}
