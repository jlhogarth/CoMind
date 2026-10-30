import type { ActivityHudRow, HudState } from "@/lib/activity-hud/model";
import type { ContinuousExcellenceSnapshot } from "@/lib/continuous-excellence/service";

export type NowSourceId =
  | "activity"
  | "continuous_excellence"
  | "approvals"
  | "cost_alerts"
  | "continuity";

export type NowOverallStatus = "complete" | "partial" | "unavailable";
export type NowSourceAvailability = "available" | "unavailable";

export interface NowAction {
  label: string;
  href: string;
}

export interface NowCandidate {
  candidate_id: string;
  source_id: NowSourceId;
  source_system: string;
  source_ref: string;
  source_state: string;
  priority: number;
  title: string;
  summary: string;
  observed_at: string;
  freshness: string;
  authority_state: "not_applicable" | "unknown" | "requested" | "authorized" | "denied" | "expired";
  evidence_ref: string | null;
  action: NowAction;
  coverage_limit: string;
}

export interface NowSourceStatus {
  source_id: NowSourceId;
  availability: NowSourceAvailability;
  coverage: "bounded_row_projection" | "aggregate_only" | "adapter_not_registered";
  observed_at: string | null;
  detail: string;
}

export interface NowSnapshot {
  generated_at: string;
  status: NowOverallStatus;
  candidates: NowCandidate[];
  sources: NowSourceStatus[];
  candidate_limit: number;
  coverage_limit: string;
}

export const NOW_CANDIDATE_LIMIT = 50;

const ACTIVITY_PRIORITY: Partial<Record<HudState, number>> = {
  deadline_exceeded: 0,
  stale_unknown: 5,
  unknown: 10,
  cancellation_requested: 15,
  blocked: 20,
  failed: 25,
  awaiting_review: 30,
  waiting_external: 45,
  running: 50,
  deferred: 55,
  queued: 60,
};

function safeTimestamp(value: string | null | undefined, fallback: string): string {
  if (value && Number.isFinite(Date.parse(value))) return value;
  return fallback;
}

export function activityAttentionCandidates(rows: ActivityHudRow[]): NowCandidate[] {
  return rows.flatMap((row) => {
    const priority = ACTIVITY_PRIORITY[row.hud_state];
    if (priority === undefined || row.is_synthetic) return [];

    const observedAt = safeTimestamp(
      row.last_source_occurred_at ?? row.last_observed_at,
      row.started_at,
    );

    return [{
      candidate_id: `activity:${row.activity_id}`,
      source_id: "activity" as const,
      source_system: row.source_system,
      source_ref: row.source_ref,
      source_state: row.hud_state,
      priority,
      title: row.title,
      summary: row.last_observation_summary ?? "Activity projection supplied no observation summary.",
      observed_at: observedAt,
      freshness: "activity_source_observation_time",
      authority_state: "not_applicable" as const,
      evidence_ref: row.last_source_event_ref ?? row.source_ref,
      action: { label: "Open Activity HUD", href: "/activity" },
      coverage_limit: row.coverage_limit,
    }];
  });
}

export function continuousExcellenceAttentionCandidates(
  snapshot: ContinuousExcellenceSnapshot,
): NowCandidate[] {
  const candidates: NowCandidate[] = [];
  const summary = snapshot.summary;

  if (summary.actionable_backlog_count > 0) {
    const count = summary.actionable_backlog_count;
    candidates.push({
      candidate_id: "continuous-excellence:actionable-backlog",
      source_id: "continuous_excellence",
      source_system: "continuous_excellence",
      source_ref: "comind.v_ce_signal_backlog",
      source_state: "actionable",
      priority: 35,
      title: `${count} Continuous Excellence signal${count === 1 ? "" : "s"} need attention`,
      summary: "Aggregate count from the accepted Continuous Excellence operator projection. Individual signals are not invented by Home.",
      observed_at: summary.generated_at,
      freshness: "continuous_excellence_generated_at",
      authority_state: "not_applicable",
      evidence_ref: "/continuous-excellence",
      action: { label: "Open Continuous Excellence", href: "/continuous-excellence" },
      coverage_limit: "Aggregate operator projection only. This candidate does not represent individual signal records.",
    });
  }

  if (summary.recovery_attention_count > 0) {
    const count = summary.recovery_attention_count;
    candidates.push({
      candidate_id: "continuity:recovery-attention",
      source_id: "continuity",
      source_system: "continuous_excellence",
      source_ref: "comind.v_ce_current_continuity_capsule",
      source_state: "recovery_attention",
      priority: 15,
      title: `${count} continuity capsule${count === 1 ? "" : "s"} require recovery attention`,
      summary: "Aggregate recovery-attention count from the accepted Continuous Excellence operator projection. Home does not infer omitted capsule detail.",
      observed_at: summary.latest_capsule_at ?? summary.generated_at,
      freshness: "continuity_capsule_observation_time",
      authority_state: "not_applicable",
      evidence_ref: "/continuous-excellence",
      action: { label: "Open recovery context", href: "/continuous-excellence" },
      coverage_limit: "Aggregate continuity status only. Capsule identity and content are not exposed by this read model.",
    });
  }

  return candidates;
}

function observedTime(candidate: NowCandidate): number {
  const parsed = Date.parse(candidate.observed_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function rankNowCandidates(
  candidates: NowCandidate[],
  limit = NOW_CANDIDATE_LIMIT,
): NowCandidate[] {
  const boundedLimit = Math.max(1, Math.min(NOW_CANDIDATE_LIMIT, Math.floor(limit) || NOW_CANDIDATE_LIMIT));
  return [...candidates]
    .sort((a, b) =>
      a.priority - b.priority ||
      observedTime(b) - observedTime(a) ||
      a.candidate_id.localeCompare(b.candidate_id),
    )
    .slice(0, boundedLimit);
}
