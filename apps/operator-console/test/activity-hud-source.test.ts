import assert from "node:assert/strict";
import test from "node:test";
import { assertActivityHudTestProject } from "../src/lib/activity-hud/source";

test("accepts only the CoMind Test Supabase URL", () => {
  assert.doesNotThrow(() => assertActivityHudTestProject("https://sbgfuanxiqepcoboxzcl.supabase.co"));
  assert.throws(() => assertActivityHudTestProject("https://production-project.supabase.co"), /restricted to the CoMind Test project/);
  assert.throws(() => assertActivityHudTestProject("http://sbgfuanxiqepcoboxzcl.supabase.co"), /restricted to the CoMind Test project/);
  assert.throws(() => assertActivityHudTestProject("not a URL"), /requires the CoMind Test Supabase project URL/);
});
