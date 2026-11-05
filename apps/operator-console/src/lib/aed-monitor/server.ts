import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertActivityHudTestProject } from "@/lib/activity-hud/source";

export class AedRequestError extends Error {}
export class AedUnavailableError extends Error {}

export type AedEnvironment = Readonly<Record<string, string | undefined>>;
export interface AedConfig {
  url: string;
  publishableKey: string;
  secretKey: string;
  operatorIds: Set<string>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const executionId = /^[0-9a-f]{24}$/;
const filter = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;

export function getAedConfig(env: AedEnvironment = process.env): AedConfig {
  if (env.OPERATOR_CONSOLE_AED_ACCESS_MODE !== "enabled") throw new AedUnavailableError("AED retrieval disabled");
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new AedUnavailableError(`Missing ${name}`);
    return value;
  };
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  try { assertActivityHudTestProject(url); }
  catch { throw new AedUnavailableError("AED retrieval requires the CoMind Test project"); }
  const ids = required("OPERATOR_CONSOLE_AED_OPERATOR_IDS").split(",").map((id) => id.trim());
  if (ids.some((id) => !uuid.test(id))) throw new AedUnavailableError("Invalid operator identity configuration");
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required("SUPABASE_SECRET_KEY"),
    operatorIds: new Set(ids),
  };
}

export function parsePage(params: URLSearchParams) {
  const integer = (name: string, defaultValue: number, max: number) => {
    const raw = params.get(name);
    if (raw === null) return defaultValue;
    if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > max) throw new AedRequestError(`Invalid ${name}`);
    return Number(raw);
  };
  const page = integer("page", 1, 10000);
  const pageSize = integer("pageSize", 25, 100);
  const kind = params.get("kind");
  const state = params.get("state");
  if ((kind && !filter.test(kind)) || (state && !filter.test(state))) throw new AedRequestError("Invalid filter");
  if ([...params.keys()].some((key) => !["page", "pageSize", "kind", "state"].includes(key))) throw new AedRequestError("Unsupported parameter");
  return { page, pageSize, kind, state };
}

export function parseExecutionId(id: string): string {
  if (!executionId.test(id)) throw new AedRequestError("Invalid execution identifier");
  return id;
}

export async function authorizeAed(
  authorization: string | null,
  config: AedConfig,
  authClient: SupabaseClient = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
): Promise<"unauthenticated" | "forbidden" | "authorized"> {
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization ?? "");
  if (!match || match[1].length > 4096) return "unauthenticated";
  try {
    const { data, error } = await authClient.auth.getUser(match[1]);
    if (error || !data.user?.id) return "unauthenticated";
    return config.operatorIds.has(data.user.id) ? "authorized" : "forbidden";
  } catch {
    throw new AedUnavailableError("Identity verification unavailable");
  }
}

export function createAedReader(config: AedConfig): SupabaseClient {
  if (typeof window !== "undefined") throw new AedUnavailableError("AED reader is server-only");
  return createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function checked<T>(value: { data: T | null; error: { message: string } | null; count?: number | null }) {
  if (value.error) throw new AedUnavailableError("AED monitoring source unavailable");
  return value;
}

export async function listExecutions(client: SupabaseClient, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const result = checked(await client.schema("comind_pm").from("pm_aed_monitor_execution")
    .select("execution_id,lane_id,workflow_run_url,first_at,last_at,event_count,source_sha256,artifact_sha256", { count: "exact" })
    .order("last_at", { ascending: false }).order("execution_id", { ascending: true })
    .range(from, from + pageSize - 1));
  return { rows: result.data ?? [], total: result.count ?? 0, page, pageSize };
}

export async function listEvents(client: SupabaseClient, id: string, page: number, pageSize: number, kind: string | null, state: string | null) {
  const execution = checked(await client.schema("comind_pm").from("pm_aed_monitor_execution")
    .select("execution_id,lane_id,workflow_run_url,first_at,last_at,event_count,source_sha256,artifact_sha256")
    .eq("execution_id", id).maybeSingle()).data;
  if (!execution) return null;
  const from = (page - 1) * pageSize;
  let query = client.schema("comind_pm").from("pm_aed_monitor_event")
    .select("execution_id,sequence,event_at,elapsed_ms,kind,case_id,state,outcome,wake_source,provider,actual_cost_usd,payload_sha256", { count: "exact" })
    .eq("execution_id", id).order("sequence", { ascending: true }).range(from, from + pageSize - 1);
  if (kind) query = query.eq("kind", kind);
  if (state) query = query.eq("state", state);
  const result = checked(await query);
  return { execution, rows: result.data ?? [], total: result.count ?? 0, page, pageSize, evidence_detail_limit: "Payload contents are withheld; integrity hash and approved event fields only." };
}
