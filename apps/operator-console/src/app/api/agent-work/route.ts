import { NextResponse } from "next/server";
import { readAgentWorkSnapshot } from "@/lib/agent-work/server";
import { ManagementPlaneUnavailableError } from "@/lib/management-plane/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await readAgentWorkSnapshot(), {
      headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const configuration = error instanceof ManagementPlaneUnavailableError && error.kind === "configuration";
    console.error("Agent work read failed", { kind: configuration ? "configuration" : "upstream" });
    return NextResponse.json({ error: "Agent work is unavailable; no status is implied." }, {
      status: configuration ? 503 : 502,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
