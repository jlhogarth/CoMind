import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface RuleBookOperatorRuntimeConfig {
  url: string;
  secretKey: string;
  reviewerId: string;
}

export class RuleBookOperatorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleBookOperatorUnavailableError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new RuleBookOperatorUnavailableError(`Missing required server environment variable ${name}`);
  }
  return value.trim();
}

export function getRuleBookOperatorRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RuleBookOperatorRuntimeConfig {
  if (environment.OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE !== "trusted-perimeter") {
    throw new RuleBookOperatorUnavailableError(
      "Protected RuleBook controls require OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE=trusted-perimeter",
    );
  }

  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL),
    secretKey: required("SUPABASE_SECRET_KEY", environment.SUPABASE_SECRET_KEY),
    reviewerId: required(
      "OPERATOR_CONSOLE_RULEBOOK_REVIEWER_ID",
      environment.OPERATOR_CONSOLE_RULEBOOK_REVIEWER_ID,
    ),
  };
}

export function createRuleBookOperatorSupabaseClient(
  config: RuleBookOperatorRuntimeConfig,
): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new RuleBookOperatorUnavailableError("Privileged RuleBook client is server-only");
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
