import { createClient } from "@supabase/supabase-js";

import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import { assertManagementPlaneSnapshot, type ManagementPlaneSnapshot } from "@/lib/management-plane/model";

export type ManagementPlaneEnvironment = Readonly<Record<string, string | undefined>>;

export class ManagementPlaneUnavailableError extends Error {
  readonly kind: "configuration" | "upstream";
  constructor(kind: "configuration" | "upstream", message: string) {
    super(message);
    this.name = "ManagementPlaneUnavailableError";
    this.kind = kind;
  }
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new ManagementPlaneUnavailableError("configuration", `Missing required server environment variable ${name}`);
  return value.trim();
}

export function getManagementPlaneRuntimeConfig(environment: ManagementPlaneEnvironment = process.env) {
  const url = required("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey = required("SUPABASE_SECRET_KEY", environment.SUPABASE_SECRET_KEY);
  try {
    assertActivityHudTestProject(url);
  } catch (error) {
    throw new ManagementPlaneUnavailableError(
      "configuration",
      error instanceof Error ? error.message : "Management-plane project validation failed",
    );
  }
  return { url, secretKey };
}

export async function readManagementPlaneSnapshot(
  environment: ManagementPlaneEnvironment = process.env,
): Promise<ManagementPlaneSnapshot> {
  const config = getManagementPlaneRuntimeConfig(environment);
  if (typeof window !== "undefined") throw new ManagementPlaneUnavailableError("configuration", "Management-plane client is server-only");
  const client = createClient(config.url, config.secretKey, {
    db: { schema: "public" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc("operator_console_l4a_management_plane");
  if (error) throw new ManagementPlaneUnavailableError("upstream", `Management-plane upstream failed with ${error.code ?? "unknown"}`);
  try {
    assertManagementPlaneSnapshot(data);
  } catch (error) {
    throw new ManagementPlaneUnavailableError(
      "upstream",
      error instanceof Error ? error.message : "Management-plane source returned invalid data",
    );
  }
  return data;
}
