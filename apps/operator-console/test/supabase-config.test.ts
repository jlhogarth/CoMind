import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoPrivilegedBrowserConfiguration,
  getPublicSupabaseConfig,
} from "../src/lib/supabase/config";

function withEnvironment(values: Record<string, string | undefined>, fn: () => void): void {
  const prior = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("requires browser-safe Supabase configuration", () => {
  withEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
    () => {
      assert.deepEqual(getPublicSupabaseConfig(), {
        url: "https://example.supabase.co",
        publishableKey: "test-publishable-key",
      });
    },
  );
});

test("fails closed if privileged database configuration is exposed with NEXT_PUBLIC", () => {
  withEnvironment({ NEXT_PUBLIC_SUPABASE_SECRET_KEY: "must-not-be-public" }, () => {
    assert.throws(assertNoPrivilegedBrowserConfiguration, /must not be browser-exposed/);
  });
});
