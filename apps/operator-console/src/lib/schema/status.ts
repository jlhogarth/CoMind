export type SchemaProviderStatus =
  | { state: "unavailable"; reason: string }
  | { state: "ready"; capturedAt: string; relationCount: number };
