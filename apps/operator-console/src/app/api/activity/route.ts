import { NextRequest, NextResponse } from "next/server";
import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import type { ActivityHudRow } from "@/lib/activity-hud/model";

export const dynamic = "force-dynamic";

const allowedScopes = new Set(["operational", "synthetic", "all"]);

type ActivityScope = "operational" | "synthetic" | "all";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required server environment variable ${name}`);
  return value;
}

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
  if (!allowedScopes.has(requestedScope)) {
    return noStoreJson({ error: "Unsupported Activity HUD scope." }, 400);
  }
  const scope = requestedScope as ActivityScope;

  try {
    const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
    const publishableKey = required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    const capability = required(
      "OPERATOR_CONSOLE_ACTIVITY_CAPABILITY",
      process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY,
    );

    assertActivityHudTestProject(supabaseUrl);
    if (capability.length < 32) {
      throw new Error("OPERATOR_CONSOLE_ACTIVITY_CAPABILITY is invalid.");
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/operator_console_activity_feed`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_capability: capability,
        p_scope: scope,
        p_limit: 1000,
      }),
    });

    if (!response.ok) {
      console.error("Activity HUD Supabase RPC failed", { status: response.status, scope });
      return noStoreJson({ error: "The governed Activity HUD source is unavailable." }, 502);
    }

    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      console.error("Activity HUD Supabase RPC returned a non-array payload", { scope });
      return noStoreJson({ error: "The governed Activity HUD source returned an invalid response." }, 502);
    }

    const rows = payload as ActivityHudRow[];
    if (rows.length > 1000) {
      console.error("Activity HUD source exceeded the server-side row bound", { count: rows.length, scope });
      return noStoreJson({ error: "The governed Activity HUD source exceeded its row bound." }, 502);
    }

    return noStoreJson({
      scope,
      rows,
      total: rows.length,
      coverage_limit:
        "Bounded current-state projection. Operational rows are canonical PM work items with their latest linked PM event; synthetic rows remain an explicit test scope.",
    });
  } catch (error) {
    console.error("Activity HUD server gateway failed", {
      message: error instanceof Error ? error.message : "Unknown server error",
      scope,
    });
    return noStoreJson({ error: "The governed Activity HUD source is not configured." }, 503);
  }
}
