export interface PublicSupabaseConfig {
  url: string;
  publishableKey: string;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function assertNoPrivilegedBrowserConfiguration(): void {
  const forbidden = [
    "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_DATABASE_URL",
  ];

  const exposed = forbidden.filter((name) => Boolean(process.env[name]));
  if (exposed.length > 0) {
    throw new Error(`Privileged database configuration must not be browser-exposed: ${exposed.join(", ")}`);
  }
}
