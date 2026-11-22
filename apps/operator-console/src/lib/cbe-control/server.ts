import { readManagementPlaneSnapshot } from "@/lib/management-plane/server";
import {
  buildCbeControlStatus,
  CbeControlValidationError,
  parseCbeControlRequest,
  safeEndpointOrigin,
  type CbeControlRequest,
} from "@/lib/cbe-control/model";

export class CbeControlUnavailableError extends Error {
  constructor(public readonly kind: "configuration" | "upstream" | "response", message: string) { super(message); }
}

export interface CbeControlRuntimeConfig {
  endpoint: string | null;
  token: string | null;
  humanAuthHosts: string[];
}

export interface CbeControlDispatchResult {
  status: string;
  message: string;
  correlation_id: string | null;
  human_action_required: boolean;
  human_action_url: string | null;
}

export function getCbeControlRuntimeConfig(env: NodeJS.ProcessEnv = process.env): CbeControlRuntimeConfig {
  const endpoint = env.COMIND_CBE_CONTROL_ENDPOINT?.trim() || null;
  const token = env.COMIND_CBE_CONTROL_TOKEN?.trim() || null;
  const humanAuthHosts = (env.COMIND_CBE_HUMAN_AUTH_HOSTS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (endpoint) {
    let parsed: URL;
    try { parsed = new URL(endpoint); } catch { throw new CbeControlUnavailableError("configuration", "CBE control endpoint is not a valid URL."); }
    const localhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(localhost && parsed.protocol === "http:")) {
      throw new CbeControlUnavailableError("configuration", "CBE control endpoint must use HTTPS, except localhost Development/Test bindings.");
    }
  }
  return { endpoint, token, humanAuthHosts };
}

function sanitizeHumanActionUrl(value: unknown, hosts: string[]): string | null {
  if (typeof value !== "string" || hosts.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch { return null; }
}

function boundedText(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 1000 ? value : fallback;
}

export async function readCbeControlStatus() {
  const management = await readManagementPlaneSnapshot();
  const config = getCbeControlRuntimeConfig();
  return buildCbeControlStatus(management, {
    configured: Boolean(config.endpoint && config.token),
    endpointOrigin: safeEndpointOrigin(config.endpoint),
  });
}

export async function dispatchCbeControlAction(
  input: unknown,
  deps: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<CbeControlDispatchResult> {
  const request: CbeControlRequest = parseCbeControlRequest(input);
  const config = getCbeControlRuntimeConfig(deps.env);
  if (!config.endpoint || !config.token) throw new CbeControlUnavailableError("configuration", "CBE execution-plane endpoint and bearer capability must both be configured.");
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        action: request.action,
        work_key: request.work_key ?? null,
        recovery_id: request.recovery_id ?? null,
        environment: "development-test",
        production_change: false,
        requested_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new CbeControlUnavailableError("upstream", "CBE execution-plane adapter could not be reached.");
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) throw new CbeControlUnavailableError("upstream", `CBE execution-plane adapter returned HTTP ${response.status}.`);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new CbeControlUnavailableError("response", "CBE execution-plane adapter returned an invalid response.");
  const record = payload as Record<string, unknown>;
  return {
    status: boundedText(record.status, "accepted"),
    message: boundedText(record.message, "CBE action accepted by the execution-plane adapter."),
    correlation_id: typeof record.correlation_id === "string" && record.correlation_id.length <= 128 ? record.correlation_id : null,
    human_action_required: record.human_action_required === true,
    human_action_url: sanitizeHumanActionUrl(record.human_action_url, config.humanAuthHosts),
  };
}

export { CbeControlValidationError };
