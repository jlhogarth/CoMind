import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const browserSource = readFileSync(new URL("../src/lib/supabase/browser.ts", import.meta.url), "utf8");

test("browser client source does not consume privileged key environment variables", () => {
  assert.doesNotMatch(browserSource, /process\.env\.SUPABASE_(SECRET|SERVICE_ROLE)/);
  assert.doesNotMatch(browserSource, /process\.env\.DATABASE_URL/);
});
