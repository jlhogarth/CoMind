import { NextResponse } from "next/server";

import { ManagementPlaneUnavailableError, readManagementPlaneSnapshot } from "@/lib/management-plane/server";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET() {
  try {
    return json(await readManagementPlaneSnapshot());
  } catch (error) {
    if (error instanceof ManagementPlaneUnavailableError) {
      console.error("L4A management-plane read failed", { kind: error.kind });
      return json(
        { error: error.kind === "configuration" ? "The governed management plane is not configured." : "The governed management plane is unavailable." },
        error.kind === "configuration" ? 503 : 502,
      );
    }
    console.error("L4A management-plane read failed", { kind: "unexpected" });
    return json({ error: "The governed management plane is unavailable." }, 502);
  }
}
