import type { ManagementLane, ManagementPlaneSnapshot } from "@/lib/management-plane/model";

export const CBE_CONTROL_ACTIONS = [
  "start_browser",
  "stop_browser",
  "retry_recovery",
  "open_auth",
  "wake_conversation",
] as const;

export type CbeControlAction = (typeof CBE_CONTROL_ACTIONS)[number];
export type CbeActionState = "AVAILABLE" | "UNAVAILABLE" | "AUTH_REQUIRED" | "HUMAN_STOP";

export interface CbeActionAvailability {
  action: CbeControlAction;
  label: string;
  state: CbeActionState;
  available: boolean;
  requires_work_key: boolean;
  reason: string;
}

export interface CbeControlLane {
  work_key: string;
  title: string;
  status: string;
  current_summary: string | null;
  next_action: string | null;
  last_event_at: string | null;
}

export interface CbeControlStatus {
  generated_at: string;
  environment: "development-test";
  production_change: false;
  execution_adapter: {
    configured: boolean;
    endpoint_origin: string | null;
  };
  authority: {
    active: boolean;
    level: string;
    production_authority: boolean;
  };
  actions: CbeActionAvailability[];
  lanes: CbeControlLane[];
}

const ACTION_META: Record<CbeControlAction, { label: string; requiresWorkKey: boolean }> = {
  start_browser: { label: "Start browser", requiresWorkKey: false },
  stop_browser: { label: "Stop browser", requiresWorkKey: false },
  retry_recovery: { label: "Retry recovery", requiresWorkKey: true },
  open_auth: { label: "Open human login", requiresWorkKey: false },
  wake_conversation: { label: "Wake conversation", requiresWorkKey: true },
};

const CONTROL_KEYS = new Set(["action", "work_key", "recovery_id"]);

export class CbeControlValidationError extends Error {}

export interface CbeControlRequest {
  action: CbeControlAction;
  work_key?: string;
  recovery_id?: string;
}

function boundedOptionalString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new CbeControlValidationError(`${field} must be a non-empty string of at most 128 characters`);
  }
  return value.trim();
}

export function parseCbeControlRequest(value: unknown): CbeControlRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CbeControlValidationError("Control request must be an object");
  const record = value as Record<string, unknown>;
  const extras = Object.keys(record).filter((key) => !CONTROL_KEYS.has(key));
  if (extras.length) throw new CbeControlValidationError(`Unexpected control request field: ${extras[0]}`);
  if (typeof record.action !== "string" || !CBE_CONTROL_ACTIONS.includes(record.action as CbeControlAction)) {
    throw new CbeControlValidationError("Unknown CBE control action");
  }
  const request: CbeControlRequest = {
    action: record.action as CbeControlAction,
    work_key: boundedOptionalString(record.work_key, "work_key"),
    recovery_id: boundedOptionalString(record.recovery_id, "recovery_id"),
  };
  if (ACTION_META[request.action].requiresWorkKey && !request.work_key) {
    throw new CbeControlValidationError(`${request.action} requires work_key`);
  }
  return request;
}

function isCbeLane(lane: ManagementLane) {
  const text = [lane.work_key, lane.title, lane.area ?? "", lane.current_summary ?? "", lane.next_action ?? ""].join(" ").toLowerCase();
  return ["cbe", "aed", "conversation", "notebook", "browser"].some((needle) => text.includes(needle));
}

export function safeEndpointOrigin(endpoint?: string | null): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    return url.origin;
  } catch {
    return null;
  }
}

export function buildCbeControlStatus(
  management: ManagementPlaneSnapshot,
  config: { configured: boolean; endpointOrigin?: string | null },
): CbeControlStatus {
  const lanes = management.lanes.filter(isCbeLane).map((lane) => ({
    work_key: lane.work_key,
    title: lane.title,
    status: lane.status,
    current_summary: lane.current_summary,
    next_action: lane.next_action,
    last_event_at: lane.last_event_at,
  }));
  const hasAuthRequired = management.lanes.some((lane) => isCbeLane(lane) && /AUTH_REQUIRED/i.test(`${lane.status} ${lane.next_action ?? ""}`));
  const hasHumanStop = management.lanes.some((lane) => isCbeLane(lane) && /HUMAN_STOP|human decision|required for Production/i.test(`${lane.status} ${lane.next_action ?? ""}`));

  const actions = CBE_CONTROL_ACTIONS.map((action): CbeActionAvailability => {
    const meta = ACTION_META[action];
    if (!management.authority.active) return { action, label: meta.label, state: "HUMAN_STOP", available: false, requires_work_key: meta.requiresWorkKey, reason: "L4A authority is not established in the canonical snapshot." };
    if (!config.configured) return { action, label: meta.label, state: "UNAVAILABLE", available: false, requires_work_key: meta.requiresWorkKey, reason: "No CBE execution-plane adapter is bound to the Operator Console." };
    if (hasHumanStop && action !== "open_auth") return { action, label: meta.label, state: "HUMAN_STOP", available: false, requires_work_key: meta.requiresWorkKey, reason: "A canonical human-stop boundary is active for a relevant CBE lane." };
    if (action === "open_auth" && !hasAuthRequired) return { action, label: meta.label, state: "AUTH_REQUIRED", available: false, requires_work_key: false, reason: "No relevant lane currently records an authentication-required state." };
    return { action, label: meta.label, state: "AVAILABLE", available: true, requires_work_key: meta.requiresWorkKey, reason: "Bounded Development/Test action is available through the configured execution adapter." };
  });

  return {
    generated_at: new Date().toISOString(),
    environment: "development-test",
    production_change: false,
    execution_adapter: { configured: config.configured, endpoint_origin: config.endpointOrigin ?? null },
    authority: {
      active: management.authority.active,
      level: management.authority.authority_level ?? "Unknown",
      production_authority: management.authority.production_authority,
    },
    actions,
    lanes,
  };
}
