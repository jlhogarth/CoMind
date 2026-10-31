export type ManagementLaneState =
  | "WORKING"
  | "WAITING_CI"
  | "RECOVERY"
  | "BLOCKED"
  | "AUTH_REQUIRED"
  | "HUMAN_STOP"
  | "STALE"
  | "READY_TO_MERGE"
  | "REVIEW"
  | "QUEUED"
  | "DEFERRED"
  | "COMPLETE"
  | "UNKNOWN";

export interface ManagementGithubSnapshot {
  issue?: string;
  pull_request?: string;
  branch?: string;
  head_sha?: string;
  base_sha?: string;
  checks_success?: string;
  checks_total?: string;
  freshness?: string;
  mergeable?: boolean;
}

export interface ManagementLane {
  work_key: string;
  title: string;
  status: string;
  priority: string;
  area: string | null;
  owner: string | null;
  current_summary: string | null;
  last_event_at: string | null;
  latest_event_type: string | null;
  latest_outcome: string | null;
  latest_result: string | null;
  next_action: string | null;
  latest_actor: string | null;
  latest_occurred_at: string | null;
  source_system?: string;
  source_ref?: string;
  github?: ManagementGithubSnapshot;
  production_change: boolean;
}

export interface ManagementBlocker {
  work_key: string;
  title: string;
  priority: string | null;
  area: string | null;
  owner: string | null;
  assignee: string | null;
  current_summary: string | null;
  last_event_at: string | null;
}

export interface ManagementAuthority {
  active: boolean;
  authorization_type?: string;
  decision?: string;
  scope?: string;
  authorized_by?: string;
  effective_at?: string;
  expires_at?: string | null;
  authority_level?: string;
  standing?: boolean;
  autonomous_merge?: boolean;
  autonomous_recovery?: boolean;
  durable_evidence_precedence?: boolean;
  non_production_autonomy?: boolean;
  production_authority: boolean;
  human_stop_boundaries?: string[];
}

export interface ManagementController {
  work_key: string;
  title: string;
  enabled: boolean;
  automation_id?: string;
  cadence?: string;
  current_summary?: string | null;
  last_event_at?: string | null;
  latest_event_type?: string | null;
  latest_outcome?: string | null;
  run_id?: string;
  recorded_status?: string;
  scheduled_for?: string;
  started_at?: string;
  completed_at?: string;
  selected_lane?: string;
  pull_request?: string;
  requires_user_action: boolean;
  source_ref?: string;
  observed_at?: string;
}

export interface ManagementPlaneSnapshot {
  generated_at: string;
  coverage_limit: string;
  authority: ManagementAuthority;
  blockers: ManagementBlocker[];
  lanes: ManagementLane[];
  controllers: ManagementController[];
}

const BANNED_KEYS = new Set([
  "access_token",
  "refresh_token",
  "password",
  "api_key",
  "client_secret",
  "service_role_key",
  "authorization_header",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function containsCredentialKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => BANNED_KEYS.has(key.toLowerCase()) || containsCredentialKey(child));
}

export function assertManagementPlaneSnapshot(value: unknown): asserts value is ManagementPlaneSnapshot {
  if (!isRecord(value)) throw new Error("Management-plane source returned a non-object payload");
  if (containsCredentialKey(value)) throw new Error("Management-plane source violated its credential boundary");
  if (!Array.isArray(value.lanes) || !Array.isArray(value.blockers) || !Array.isArray(value.controllers)) {
    throw new Error("Management-plane source returned malformed collections");
  }
  if (!isRecord(value.authority) || typeof value.authority.active !== "boolean") {
    throw new Error("Management-plane source returned malformed authority state");
  }
  if (value.lanes.length > 200 || value.blockers.length > 200 || value.controllers.length > 10) {
    throw new Error("Management-plane source exceeded its bounded projection");
  }
}

function text(row: ManagementLane): string {
  return [row.current_summary, row.latest_result, row.next_action].filter(Boolean).join(" ").toLowerCase();
}

function integer(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export function deriveManagementLaneState(row: ManagementLane): ManagementLaneState {
  if (row.status === "done") return "COMPLETE";
  const evidenceText = text(row);
  if (/human_confirmation_required|human stop|human decision required/.test(evidenceText)) return "HUMAN_STOP";
  if (/auth_required|scope_required|oauth required|reauthoriz/.test(evidenceText)) return "AUTH_REQUIRED";
  if (row.status === "blocked") return "BLOCKED";
  if (row.github?.freshness === "stale") return "STALE";
  if (row.latest_event_type === "recovery") return "RECOVERY";

  const success = integer(row.github?.checks_success);
  const total = integer(row.github?.checks_total);
  if (row.github?.pull_request && success !== null && total !== null && success < total) return "WAITING_CI";
  if (
    row.status === "review" && row.github?.pull_request && total !== null && total > 0 && success === total &&
    row.github.mergeable === true && ["reconciled", "fresh_at_merge", "fresh"].includes(row.github.freshness ?? "")
  ) return "READY_TO_MERGE";
  if (row.status === "review") return "REVIEW";
  if (row.status === "in_progress") return "WORKING";
  if (row.status === "ready" || row.status === "backlog") return "QUEUED";
  if (row.status === "deferred") return "DEFERRED";
  return "UNKNOWN";
}

const PRIORITY = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
export function sortManagementLanes(rows: ManagementLane[]): ManagementLane[] {
  return [...rows].sort((a, b) => {
    const ap = PRIORITY[a.priority as keyof typeof PRIORITY] ?? 9;
    const bp = PRIORITY[b.priority as keyof typeof PRIORITY] ?? 9;
    if (ap !== bp) return ap - bp;
    const at = Date.parse(a.last_event_at ?? "") || 0;
    const bt = Date.parse(b.last_event_at ?? "") || 0;
    return bt - at || a.work_key.localeCompare(b.work_key);
  });
}

export function managementCounts(rows: ManagementLane[]) {
  const states = rows.map(deriveManagementLaneState);
  return {
    total: rows.length,
    active: states.filter((state) => !["COMPLETE", "DEFERRED"].includes(state)).length,
    waitingCi: states.filter((state) => state === "WAITING_CI").length,
    blocked: states.filter((state) => ["BLOCKED", "AUTH_REQUIRED", "HUMAN_STOP"].includes(state)).length,
    recovery: states.filter((state) => state === "RECOVERY").length,
    readyToMerge: states.filter((state) => state === "READY_TO_MERGE").length,
  };
}
