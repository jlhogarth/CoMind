import type { ActivityHudRow } from "@/lib/activity-hud/model";
import type { ContinuousExcellenceSnapshot } from "@/lib/continuous-excellence/service";
import {
  NOW_CANDIDATE_LIMIT,
  activityAttentionCandidates,
  continuousExcellenceAttentionCandidates,
  rankNowCandidates,
  type NowCandidate,
  type NowSnapshot,
  type NowSourceStatus,
} from "@/lib/home/now-model";

export interface NowSourceReaders {
  readActivity: () => Promise<ActivityHudRow[]>;
  readContinuousExcellence: () => Promise<ContinuousExcellenceSnapshot>;
}

function latestActivityObservation(rows: ActivityHudRow[]): string | null {
  const values = rows
    .flatMap((row) => [row.last_source_occurred_at, row.last_observed_at, row.started_at])
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return values[0] ?? null;
}

function unavailableSource(
  sourceId: NowSourceStatus["source_id"],
  coverage: NowSourceStatus["coverage"],
  detail: string,
): NowSourceStatus {
  return {
    source_id: sourceId,
    availability: "unavailable",
    coverage,
    observed_at: null,
    detail,
  };
}

export async function composeNowSnapshot(
  readers: NowSourceReaders,
  now: Date = new Date(),
): Promise<NowSnapshot> {
  const generatedAt = now.toISOString();
  const [activityResult, continuousExcellenceResult] = await Promise.allSettled([
    readers.readActivity(),
    readers.readContinuousExcellence(),
  ]);

  const candidates: NowCandidate[] = [];
  const sources: NowSourceStatus[] = [];

  if (activityResult.status === "fulfilled") {
    candidates.push(...activityAttentionCandidates(activityResult.value));
    sources.push({
      source_id: "activity",
      availability: "available",
      coverage: "bounded_row_projection",
      observed_at: latestActivityObservation(activityResult.value) ?? generatedAt,
      detail: "Accepted operational Activity projection was read successfully.",
    });
  } else {
    sources.push(unavailableSource(
      "activity",
      "bounded_row_projection",
      "Accepted operational Activity projection is unavailable.",
    ));
  }

  if (continuousExcellenceResult.status === "fulfilled") {
    const ceSnapshot = continuousExcellenceResult.value;
    candidates.push(...continuousExcellenceAttentionCandidates(ceSnapshot));
    sources.push({
      source_id: "continuous_excellence",
      availability: "available",
      coverage: "aggregate_only",
      observed_at: ceSnapshot.summary.generated_at,
      detail: "Accepted Continuous Excellence aggregate operator projection was read successfully.",
    });
    sources.push({
      source_id: "continuity",
      availability: "available",
      coverage: "aggregate_only",
      observed_at: ceSnapshot.summary.latest_capsule_at ?? ceSnapshot.summary.generated_at,
      detail: "Continuity coverage is limited to aggregate recovery fields exposed by the accepted Continuous Excellence operator projection.",
    });
  } else {
    sources.push(unavailableSource(
      "continuous_excellence",
      "aggregate_only",
      "Accepted Continuous Excellence operator projection is unavailable.",
    ));
    sources.push(unavailableSource(
      "continuity",
      "aggregate_only",
      "Continuity aggregate is unavailable because its accepted operator projection could not be read.",
    ));
  }

  sources.push(unavailableSource(
    "approvals",
    "adapter_not_registered",
    "No accepted Home-safe approval read adapter is registered in HOME-002.",
  ));
  sources.push(unavailableSource(
    "cost_alerts",
    "adapter_not_registered",
    "No accepted Home-safe cost-alert read adapter is registered in HOME-002.",
  ));

  const availableCount = sources.filter((source) => source.availability === "available").length;
  const status = availableCount === 0
    ? "unavailable"
    : availableCount === sources.length
      ? "complete"
      : "partial";

  return {
    generated_at: generatedAt,
    status,
    candidates: rankNowCandidates(candidates, NOW_CANDIDATE_LIMIT),
    sources,
    candidate_limit: NOW_CANDIDATE_LIMIT,
    coverage_limit:
      "Now composes only registered governed source adapters. Missing or unavailable sources reduce coverage and never imply zero work, zero risk, or healthy state.",
  };
}
