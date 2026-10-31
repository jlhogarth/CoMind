import { assertActivityHudTestProject } from "@/lib/activity-hud/source";
import type { ActivityHudRow } from "@/lib/activity-hud/model";

export type ActivityScope = "operational" | "synthetic" | "all";

export interface ActivityHudRuntimeConfig {
  supabaseUrl: string;
  publishableKey: string;
  capability: string;
}

export type ActivityHudEnvironment = Readonly<Record<string, string | undefined>>;

export class ActivityHudUnavailableError extends Error {
  readonly kind: "configuration" | "upstream";

  constructor(kind: "configuration" | "upstream", message: string) {
    super(message);
    this.name = "ActivityHudUnavailableError";
    this.kind = kind;
  }
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new ActivityHudUnavailableError(
      "configuration",
      `Missing required server environment variable ${name}`,
    );
  }
  return value.trim();
}

export function getActivityHudRuntimeConfig(
  environment: ActivityHudEnvironment = process.env,
): ActivityHudRuntimeConfig {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const capability = required(
    "OPERATOR_CONSOLE_ACTIVITY_CAPABILITY",
    environment.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY,
  );

  try {
    assertActivityHudTestProject(supabaseUrl);
  } catch (error) {
    throw new ActivityHudUnavailableError(
      "configuration",
      error instanceof Error ? error.message : "Activity HUD project validation failed",
    );
  }

  if (capability.length < 32) {
    throw new ActivityHudUnavailableError(
      "configuration",
      "OPERATOR_CONSOLE_ACTIVITY_CAPABILITY is invalid.",
    );
  }

  return { supabaseUrl, publishableKey, capability };
}

export async function readActivityHudRows(
  scope: ActivityScope,
  options: Readonly<{
    environment?: ActivityHudEnvironment;
    fetchFn?: typeof fetch;
  }> = {},
): Promise<ActivityHudRow[]> {
  const config = getActivityHudRuntimeConfig(options.environment);
  const fetchFn = options.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/operator_console_activity_feed`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_capability: config.capability,
        p_scope: scope,
        p_limit: 1000,
      }),
    });
  } catch {
    throw new ActivityHudUnavailableError("upstream", "Activity HUD upstream request failed");
  }

  if (!response.ok) {
    throw new ActivityHudUnavailableError(
      "upstream",
      `Activity HUD upstream returned HTTP ${response.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ActivityHudUnavailableError("upstream", "Activity HUD upstream returned invalid JSON");
  }

  if (!Array.isArray(payload)) {
    throw new ActivityHudUnavailableError(
      "upstream",
      "Activity HUD upstream returned a non-array payload",
    );
  }

  if (payload.length > 1000) {
    throw new ActivityHudUnavailableError(
      "upstream",
      "Activity HUD upstream exceeded the server-side row bound",
    );
  }

  return payload as ActivityHudRow[];
}
