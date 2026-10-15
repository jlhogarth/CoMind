import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertNoPrivilegedBrowserConfiguration, getPublicSupabaseConfig } from "./config";

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabaseClient(): SupabaseClient {
  assertNoPrivilegedBrowserConfiguration();

  if (!browserClient) {
    const { url, publishableKey } = getPublicSupabaseConfig();
    browserClient = createClient(url, publishableKey, {
      db: { schema: "public" },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
