import { readActivityHudRows } from "@/lib/activity-hud/server";
import { readContinuousExcellenceSnapshot } from "@/lib/continuous-excellence/service";
import {
  createContinuousExcellenceSupabaseClient,
  getContinuousExcellenceRuntimeConfig,
} from "@/lib/continuous-excellence/server";
import { composeNowSnapshot } from "@/lib/home/now-service";
import type { NowSnapshot } from "@/lib/home/now-model";

async function readContinuousExcellenceForHome() {
  const config = getContinuousExcellenceRuntimeConfig();
  const client = createContinuousExcellenceSupabaseClient(config);
  return readContinuousExcellenceSnapshot(client);
}

export async function readHomeNowSnapshot(now: Date = new Date()): Promise<NowSnapshot> {
  return composeNowSnapshot(
    {
      readActivity: () => readActivityHudRows("operational"),
      readContinuousExcellence: readContinuousExcellenceForHome,
    },
    now,
  );
}
