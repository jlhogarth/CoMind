export type HudState =
  | "queued"
  | "running"
  | "waiting_external"
  | "cancellation_requested"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown"
  | "deadline_exceeded"
  | "stale_unknown";

export interface ActivityHudRow {
  activity_id: string;
  activity_key: string;
  source_system: string;
  source_ref: string;
  title: string;
  owner_label: string | null;
  started_at: string;
  expected_deadline_at: string | null;
  stale_after_seconds: number;
  latest_observation_id: string | null;
  latest_event_type: string | null;
  last_reported_status: string | null;
  last_source_event_ref: string | null;
  last_source_occurred_at: string | null;
  last_observed_at: string | null;
  last_observation_summary: string | null;
  last_evidence: unknown[];
  hud_state: HudState;
  evidence_based_resolution: "completed" | "failed" | "cancelled" | null;
  has_terminal_source_evidence: boolean;
  is_synthetic: boolean;
  coverage_limit: string;
}

export type ActivitySort =
  | "investigation"
  | "longest_wait"
  | "last_observed"
  | "newest_started"
  | "title";

export interface ActivityPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  firstItem: number;
  lastItem: number;
}

export function paginateActivityRows<T>(rows: T[], requestedPage: number, requestedPageSize: number): ActivityPage<T> {
  const pageSize = [10, 25, 50].includes(requestedPageSize) ? requestedPageSize : 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);
  return {
    items,
    page,
    pageSize,
    total: rows.length,
    pageCount,
    firstItem: rows.length === 0 ? 0 : start + 1,
    lastItem: start + items.length,
  };
}

const INVESTIGATION_RANK: Record<HudState, number> = {
  deadline_exceeded: 0,
  stale_unknown: 1,
  unknown: 2,
  cancellation_requested: 3,
  failed: 4,
  running: 5,
  waiting_external: 5,
  queued: 6,
  cancelled: 7,
  completed: 8,
} as Record<HudState, number>;

const NO_RETURN_STATES = new Set<HudState>([
  "deadline_exceeded",
  "stale_unknown",
  "unknown",
  "cancellation_requested",
]);

function timestamp(value: string | null | undefined, fallback: string): number {
  const parsed = Date.parse(value ?? "");
  if (Number.isFinite(parsed)) return parsed;
  const defaultTime = Date.parse(fallback);
  return Number.isFinite(defaultTime) ? defaultTime : 0;
}

export function needsInvestigation(row: ActivityHudRow): boolean {
  return NO_RETURN_STATES.has(row.hud_state) || (row.hud_state === "failed" && row.has_terminal_source_evidence);
}

export function hasNoTerminalReturn(row: ActivityHudRow): boolean {
  return !row.has_terminal_source_evidence;
}

export function sortActivityRows(rows: ActivityHudRow[], sort: ActivitySort): ActivityHudRow[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    const aStart = timestamp(a.started_at, "");
    const bStart = timestamp(b.started_at, "");
    const aSeen = timestamp(a.last_observed_at, a.started_at);
    const bSeen = timestamp(b.last_observed_at, b.started_at);
    let result = 0;

    if (sort === "investigation") {
      result = INVESTIGATION_RANK[a.hud_state] - INVESTIGATION_RANK[b.hud_state];
      if (result === 0 && !a.has_terminal_source_evidence && !b.has_terminal_source_evidence) {
        result = aSeen - bSeen;
      }
      if (result === 0) result = aStart - bStart;
    } else if (sort === "longest_wait") {
      result = aSeen - bSeen || aStart - bStart;
    } else if (sort === "last_observed") {
      result = bSeen - aSeen || aStart - bStart;
    } else if (sort === "newest_started") {
      result = bStart - aStart;
    } else {
      result = collator.compare(a.title, b.title);
    }

    return result || collator.compare(a.activity_key, b.activity_key);
  });
}

export function formatElapsed(isoDate: string | null, now = Date.now()): string {
  if (!isoDate) return "No source observation";
  const time = Date.parse(isoDate);
  if (!Number.isFinite(time)) return "Time unavailable";
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
