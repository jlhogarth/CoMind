export interface MetadataProvenance {
  provider: string;
  capturedAt: string;
  schema: string;
}

export function validateMetadataProvenance(value: MetadataProvenance): MetadataProvenance {
  if (!value.provider || !value.schema || Number.isNaN(Date.parse(value.capturedAt))) {
    throw new Error("Invalid schema metadata provenance");
  }
  return value;
}
