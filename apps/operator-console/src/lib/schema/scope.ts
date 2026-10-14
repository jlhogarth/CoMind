import { DEFAULT_SCHEMA } from "./constants";

export function assertSupportedSchema(schema: string): void {
  if (schema !== DEFAULT_SCHEMA) throw new Error(`Unsupported schema in OC-001: ${schema}`);
}
