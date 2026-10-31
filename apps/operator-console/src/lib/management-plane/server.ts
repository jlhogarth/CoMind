import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import { assertManagementPlaneSnapshot, type ManagementPlaneSnapshot } from "@/lib/management-plane/model";

export interface ManagementPlaneRuntimeConfig {
  supabaseUrl: string;
  publishableKey: string;
  capability: string;
}

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

export function getManagementPlaneRuntimeConfig(
  environment: ManagementPlaneEnvironment = process.env,
): ManagementPlaneRuntimeConfig {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const capability = required("OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY", environment.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY);
  try {
    assertActivityHudTestProject(supabaseUrl);
  } catch (error) {
    throw new ManagementPlaneUnavailableError(
      "configuration",
      error instanceof Error ? error.message : "Management-plane project validation failed",
    );
  }
  if (capability.length < 32) {
    throw new ManagementPlaneUnavailableError("configuration", "OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY is invalid.");
  }
  return { supabaseUrl, publishableKey, capability };
}

export async function readManagementPlaneSnapshot(
  environment: ManagementPlaneEnvironment = process.env,
  fetchFn: typeof fetch = fetch,
): Promise<ManagementPlaneSnapshot> {
  const config = getManagementPlaneRuntimeConfig(environment);
  if (typeof window !== "undefined") throw new ManagementPlaneUnavailableError("configuration", "Management-plane client is server-only");

  let response: Response;
  try {
    response = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/operator_console_l4a_management_plane`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_capability: config.capability }),
    });
  } catch {
    throw new ManagementPlaneUnavailableError("upstream", "Management-plane upstream request failed");
  }

  if (!response.ok) {
    throw new ManagementPlaneUnavailableError("upstream", `Management-plane upstream returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ManagementPlaneUnavailableError("upstream", "Management-plane upstream returned invalid JSON");
  }

  try {
    assertManagementPlaneSnapshot(payload);
  } catch (error) {
    throw new ManagementPlaneUnavailableError(
      "upstream",
      error instanceof Error ? error.message : "Management-plane source returned invalid data",
    );
  }
  return payload;
}
