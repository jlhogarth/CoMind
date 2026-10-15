import type { RawSchemaMetadata } from "./types";

export interface SchemaMetadataProvider {
  loadPublicSchema(): Promise<RawSchemaMetadata>;
}

export class MetadataProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataProviderUnavailableError";
  }
}

export function requireSchemaMetadataProvider(provider: SchemaMetadataProvider | undefined): SchemaMetadataProvider {
  if (!provider) {
    throw new MetadataProviderUnavailableError(
      "No protected schema metadata provider is configured. Live catalog introspection remains disabled until a least-privilege server-side provider is authorized and verified.",
    );
  }
  return provider;
}
