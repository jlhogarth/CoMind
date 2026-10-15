import assert from "node:assert/strict";
import test from "node:test";

import { getServerSupabaseConfig } from "../src/lib/supabase/server";

test("server Supabase config requires modern secret key format", () => {
  assert.deepEqual(
    getServerSupabaseConfig({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test_value",
    }),
    {
      url: "https://example.supabase.co",
      secretKey: "sb_secret_test_value",
    },
  );

  assert.throws(
    () => getServerSupabaseConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "legacy-jwt" }),
    /modern sb_secret_/,
  );
});

test("server Supabase config fails closed when missing", () => {
  assert.throws(() => getServerSupabaseConfig({}), /SUPABASE_URL/);
});
