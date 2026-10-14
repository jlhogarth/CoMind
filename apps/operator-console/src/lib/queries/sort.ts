import { assertSafeIdentifier } from "./identifiers";

export interface SortSpec {
  column: string;
  ascending: boolean;
}

export function validateSort(spec: SortSpec): SortSpec {
  assertSafeIdentifier(spec.column, "sort column");
  return spec;
}
