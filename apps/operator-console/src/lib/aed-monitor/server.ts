import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { assertActivityHudTestProject } from "@/lib/activity-hud/source";

export class AedRequestError extends Error {}
export class AedUnavailableError extends Error {}

export type AedEnvironment = Readonly<Record<string, string | undefined>>;
export interface AedConfig {
  url: string;
  publishableKey: string;
  databaseUrl: string;
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
  const databaseUrl = required("AED_MONITOR_DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(databaseUrl); }
  catch { throw new AedUnavailableError("Invalid AED reader connection"); }
  const projectRef = "sbgfuanxiqepcoboxzcl";
  const direct = parsed.hostname === `db.${projectRef}.supabase.co` && parsed.username === "comind_aed_monitor_reader";
  const pooled = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `comind_aed_monitor_reader.${projectRef}`;
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !(direct || pooled) ||
      parsed.pathname !== "/postgres") {
    throw new AedUnavailableError("AED reader must use the dedicated CoMind database role");
  }
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    databaseUrl,
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

export interface AedReader {
  executions(page: number, pageSize: number): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }>;
  events(id: string, page: number, pageSize: number, kind: string | null, state: string | null): Promise<null | {
    execution: Record<string, unknown>; rows: Record<string, unknown>[]; total: number; page: number; pageSize: number; evidence_detail_limit: string;
  }>;
}

const executionColumns = "execution_id,lane_id,workflow_run_url,first_at,last_at,event_count,source_sha256,artifact_sha256";
const eventColumns = "execution_id,sequence,event_at,elapsed_ms,kind,case_id,state,outcome,wake_source,provider,actual_cost_usd,payload_sha256";

export function createAedReader(config: AedConfig): AedReader {
  if (typeof window !== "undefined") throw new AedUnavailableError("AED reader is server-only");
  async function withReader<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const identity = await client.query("SELECT current_user AS role, current_setting('transaction_read_only') AS read_only");
      if (identity.rows[0]?.role !== "comind_aed_monitor_reader" || identity.rows[0]?.read_only !== "on") {
        throw new AedUnavailableError("Dedicated read-only reader identity required");
      }
      return await run(client);
    } catch {
      throw new AedUnavailableError("AED monitoring source unavailable");
    } finally {
      try { await client.query("ROLLBACK"); } catch { /* An unavailable connection cannot be rolled back. */ }
      await client.end().catch(() => undefined);
    }
  }
  return {
    executions: (page, pageSize) => withReader(async (client) => {
      const count = await client.query("SELECT count(*)::integer AS total FROM comind_pm.pm_aed_monitor_execution");
      const rows = await client.query(`SELECT ${executionColumns} FROM comind_pm.pm_aed_monitor_execution ORDER BY last_at DESC, execution_id ASC OFFSET $1 LIMIT $2`, [(page - 1) * pageSize, pageSize]);
      return { rows: rows.rows, total: count.rows[0].total, page, pageSize };
    }),
    events: (id, page, pageSize, kind, state) => withReader(async (client) => {
      const execution = await client.query(`SELECT ${executionColumns} FROM comind_pm.pm_aed_monitor_execution WHERE execution_id = $1`, [id]);
      if (execution.rowCount === 0) return null;
      const conditions = "execution_id = $1 AND ($2::text IS NULL OR kind = $2) AND ($3::text IS NULL OR state = $3)";
      const count = await client.query(`SELECT count(*)::integer AS total FROM comind_pm.pm_aed_monitor_event WHERE ${conditions}`, [id, kind, state]);
      const rows = await client.query(`SELECT ${eventColumns} FROM comind_pm.pm_aed_monitor_event WHERE ${conditions} ORDER BY sequence ASC OFFSET $4 LIMIT $5`, [id, kind, state, (page - 1) * pageSize, pageSize]);
      return { execution: execution.rows[0], rows: rows.rows, total: count.rows[0].total, page, pageSize,
        evidence_detail_limit: "Payload contents are withheld; integrity hash and approved event fields only." };
    }),
  };
}
