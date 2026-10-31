import { NextResponse } from "next/server";

import { readContinuousExcellenceSnapshot } from "@/lib/continuous-excellence/service";
import {
  createContinuousExcellenceSupabaseClient,
  ContinuousExcellenceUnavailableError,
  getContinuousExcellenceRuntimeConfig,
} from "@/lib/continuous-excellence/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getContinuousExcellenceRuntimeConfig();
    const client = createContinuousExcellenceSupabaseClient(config);
    const snapshot = await readContinuousExcellenceSnapshot(client);
    return NextResponse.json(
      { available: true, ...snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ContinuousExcellenceUnavailableError) {
      return NextResponse.json(
        { available: false, error: "Protected Continuous Excellence status is unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Continuous Excellence operator read failed", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { available: false, error: "Continuous Excellence operator read failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
