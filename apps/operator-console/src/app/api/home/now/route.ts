import { NextResponse } from "next/server";

import { readHomeNowSnapshot } from "@/lib/home/server";
import type { NowSnapshot } from "@/lib/home/now-model";

export const dynamic = "force-dynamic";

type NowReader = () => Promise<NowSnapshot>;

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function createNowGet(reader: NowReader = readHomeNowSnapshot) {
  return async function GET() {
    try {
      const snapshot = await reader();
      return noStoreJson(snapshot, snapshot.status === "unavailable" ? 503 : 200);
    } catch (error) {
      console.error("CoMind Home Now projection failed", {
        name: error instanceof Error ? error.name : typeof error,
      });
      return noStoreJson(
        {
          status: "unavailable",
          error: "CoMind Home Now projection is unavailable.",
        },
        500,
      );
    }
  };
}

export const GET = createNowGet();
