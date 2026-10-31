import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ContinuousExcellenceRuntimeConfig {
  url: string;
  secretKey: string;
}

export type ContinuousExcellenceEnvironment = Readonly<Record<string, string | undefined>>;

export class ContinuousExcellenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContinuousExcellenceUnavailableError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new ContinuousExcellenceUnavailableError(`Missing required server environment variable ${name}`);
  }
  return value.trim();
}

export function getContinuousExcellenceRuntimeConfig(
  environment: ContinuousExcellenceEnvironment = process.env,
): ContinuousExcellenceRuntimeConfig {
  if (environment.OPERATOR_CONSOLE_CE_ACCESS_MODE !== "trusted-perimeter") {
    throw new ContinuousExcellenceUnavailableError(
      "Continuous Excellence controls require OPERATOR_CONSOLE_CE_ACCESS_MODE=trusted-perimeter",
    );
  }

  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL),
    secretKey: required("SUPABASE_SECRET_KEY", environment.SUPABASE_SECRET_KEY),
  };
}

export function createContinuousExcellenceSupabaseClient(
  config: ContinuousExcellenceRuntimeConfig,
): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new ContinuousExcellenceUnavailableError("Privileged Continuous Excellence client is server-only");
  }

  return createClient(config.url, config.secretKey, {
    db: { schema: "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
