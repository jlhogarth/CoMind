import { NextRequest, NextResponse } from "next/server";

import {
  ActivityHudUnavailableError,
  type ActivityScope,
  readActivityHudRows,
} from "@/lib/activity-hud/server";

export const dynamic = "force-dynamic";

const allowedScopes = new Set<ActivityScope>(["operational", "synthetic", "all"]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const requestedScope = (request.nextUrl.searchParams.get("scope") ?? "operational").toLowerCase();
  if (!allowedScopes.has(requestedScope as ActivityScope)) {
    return noStoreJson({ error: "Unsupported Activity HUD scope." }, 400);
  }
  const scope = requestedScope as ActivityScope;

  try {
    const rows = await readActivityHudRows(scope);
    return noStoreJson({
      scope,
      rows,
      total: rows.length,
      coverage_limit:
        "Bounded current-state projection. Operational rows are canonical PM work items with their latest linked PM event; synthetic rows remain an explicit test scope.",
    });
  } catch (error) {
    if (error instanceof ActivityHudUnavailableError) {
      console.error("Activity HUD server gateway failed", { kind: error.kind, scope });
      if (error.kind === "upstream") {
        return noStoreJson({ error: "The governed Activity HUD source is unavailable." }, 502);
      }
      return noStoreJson({ error: "The governed Activity HUD source is not configured." }, 503);
    }

    console.error("Activity HUD server gateway failed", { kind: "unexpected", scope });
    return noStoreJson({ error: "The governed Activity HUD source is unavailable." }, 502);
  }
}
