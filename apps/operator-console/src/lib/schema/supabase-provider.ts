import type { SupabaseClient } from "@supabase/supabase-js";

import { validateSchemaMetadata } from "./validate";
import type { RawSchemaMetadata } from "./types";
import type { SchemaMetadataProvider } from "./provider";

export class SupabaseSchemaMetadataProvider implements SchemaMetadataProvider {
  constructor(private readonly client: SupabaseClient) {}

  async loadPublicSchema(): Promise<RawSchemaMetadata> {
    const { data, error } = await this.client.rpc("operator_console_schema_metadata");
    if (error) {
      throw new Error(`Unable to load protected schema metadata: ${error.message}`);
    }
    return validateSchemaMetadata(data);
  }
}
