import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ServerSupabaseConfig {
  url: string;
  secretKey: string;
}

type Environment = Record<string, string | undefined>;

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required server environment variable ${name}`);
  }
  return value;
}

export function getServerSupabaseConfig(
  env: Environment = process.env,
): ServerSupabaseConfig {
  const url = required("SUPABASE_URL", env.SUPABASE_URL);
  const secretKey = required("SUPABASE_SECRET_KEY", env.SUPABASE_SECRET_KEY);

  if (!secretKey.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY must use the modern sb_secret_ key format");
  }

  return { url, secretKey };
}

export function createServerSupabaseClient(
  config: ServerSupabaseConfig = getServerSupabaseConfig(),
): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    db: { schema: "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
