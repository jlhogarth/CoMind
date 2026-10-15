import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "schema_metadata_provider_unavailable",
      message:
        "Protected PostgreSQL metadata introspection is not configured. OC-001 will not fall back to privileged browser credentials.",
    },
    { status: 503 },
  );
}
