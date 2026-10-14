export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is";

export interface ColumnFilter {
  column: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export function validateFilters(filters: ColumnFilter[]): ColumnFilter[] {
  for (const filter of filters) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(filter.column)) {
      throw new Error(`Invalid filter column: ${filter.column}`);
    }
  }
  return filters;
}
