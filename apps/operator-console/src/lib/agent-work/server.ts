import { getManagementPlaneRuntimeConfig, ManagementPlaneUnavailableError, type ManagementPlaneEnvironment } from "@/lib/management-plane/server";

export interface AgentWorkItem {
  run_key: string; manifest_id: string; manifest_at: string;
  specialist_key: string; profile_id: string; task_id: string; capability_code: string;
  progress_id: string | null; observed_at: string | null;
  phase: string | null; blocker_code: string | null; result_ref: string | null;
  lease_state: string | null; lease_expires_at: string | null;
  lease_updated_at: string | null; fencing_epoch: number | null;
  attention: "reconcile" | "complete" | "stale_claim" | "in_progress" | "unknown";
}
export interface AgentWorkSnapshot {
  schema_version: "comind.agcol-003.operator-work.v1";
  generated_at: string; coverage_limit: string;
  activation_mode: "bounded_test_invocation"; always_running: false;
  work: AgentWorkItem[];
}

function validItem(item: unknown): item is AgentWorkItem {
  if (!item || typeof item !== "object") return false;
  const row = item as Record<string, unknown>;
  return ["run_key", "manifest_id", "manifest_at", "specialist_key", "profile_id", "task_id", "capability_code"]
    .every(key => typeof row[key] === "string")
    && ["progress_id", "observed_at", "phase", "blocker_code", "result_ref", "lease_state", "lease_expires_at", "lease_updated_at"]
      .every(key => row[key] === null || typeof row[key] === "string")
    && (row.fencing_epoch === null || typeof row.fencing_epoch === "number")
    && ["reconcile", "complete", "stale_claim", "in_progress", "unknown"].includes(String(row.attention));
}

export async function readAgentWorkSnapshot(
  environment: ManagementPlaneEnvironment = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<AgentWorkSnapshot> {
  const config = getManagementPlaneRuntimeConfig(environment);
  if (typeof window !== "undefined") throw new ManagementPlaneUnavailableError("configuration", "Agent work reader is server-only");
  let response: Response;
  try {
    response = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/operator_console_agcol_work`, {
      method: "POST", cache: "no-store",
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`,
        Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ p_capability: config.capability }),
    });
  } catch { throw new ManagementPlaneUnavailableError("upstream", "Agent work upstream request failed"); }
  if (!response.ok) throw new ManagementPlaneUnavailableError("upstream", `Agent work upstream returned HTTP ${response.status}`);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new ManagementPlaneUnavailableError("upstream", "Agent work upstream returned invalid JSON"); }
  if (!payload || typeof payload !== "object") throw new ManagementPlaneUnavailableError("upstream", "Agent work response invalid");
  const data = payload as Record<string, unknown>;
  if (data.schema_version !== "comind.agcol-003.operator-work.v1"
    || typeof data.generated_at !== "string" || typeof data.coverage_limit !== "string"
    || data.activation_mode !== "bounded_test_invocation" || data.always_running !== false
    || !Array.isArray(data.work) || data.work.length > 640 || !data.work.every(validItem)) {
    throw new ManagementPlaneUnavailableError("upstream", "Agent work response invalid");
  }
  return data as unknown as AgentWorkSnapshot;
}
