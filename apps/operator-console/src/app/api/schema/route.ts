import { NextResponse } from "next/server";

import { SupabaseSchemaMetadataProvider } from "@/lib/schema/supabase-provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = new SupabaseSchemaMetadataProvider(createServerSupabaseClient());
    const metadata = await provider.loadPublicSchema();

    return NextResponse.json(metadata, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown schema metadata failure";
    return NextResponse.json(
      {
        error: "schema_metadata_provider_unavailable",
        message,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
