import assert from "node:assert/strict";
import test from "node:test";
import { getRunBookConsoleConfig, parseRunBookLifecycleStatus } from "../src/lib/runbook-lifecycle/server";

test("RunBook Console requires a bound Test project and trusted perimeter", () => {
  assert.throws(() => getRunBookConsoleConfig({}), /disabled/);
  const env = {
    DRB_RUNBOOK_CONSOLE: "test",
    DRB_RUNBOOK_CONSOLE_DATABASE_URL:
      "postgres://comind_runbook_console_login@db.sbgfuanxiqepcoboxzcl.supabase.co/postgres?sslmode=verify-full",
    VERCEL_ENV: "preview",
  };
  assert.throws(() => getRunBookConsoleConfig(env), /protected Test preview/);
  const bound = { ...env, DRB_RUNBOOK_CONSOLE_ACCESS: "trusted-test-perimeter" };
  assert.equal(getRunBookConsoleConfig(bound), env.DRB_RUNBOOK_CONSOLE_DATABASE_URL);
  assert.throws(() => getRunBookConsoleConfig({ ...bound, VERCEL_ENV: "production" }), /protected Test preview/);
  assert.throws(() => getRunBookConsoleConfig({
    ...bound, DRB_RUNBOOK_CONSOLE_DATABASE_URL: env.DRB_RUNBOOK_CONSOLE_DATABASE_URL.replace("comind_runbook_console_login", "postgres"),
  }), /scoped TLS binding/);
});

test("a manual probe leaves the scheduler status missed", () => {
  const snapshot = {
    due_at: "2026-11-09T14:00:00Z", state: "missed", scheduled_receipt_id: null,
    latest: { id: "synthetic-receipt", observed_at: "2026-11-10T20:00:00Z", trigger: "probe",
      size: "review", units: 338884, rollover: "blocked", policy_version: 1 },
  };
  assert.deepEqual(parseRunBookLifecycleStatus(snapshot), snapshot);
  assert.throws(() => parseRunBookLifecycleStatus({ ...snapshot, latest: { ...snapshot.latest, trigger: "unknown" } }));
});
