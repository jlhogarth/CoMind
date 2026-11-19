import assert from "node:assert/strict";
import test from "node:test";
import { getRunBookConsoleConfig, parseRunBookLifecycleStatus } from "../src/lib/runbook-lifecycle/server";

test("RunBook Console requires a bound Test project and trusted perimeter", () => {
  assert.throws(() => getRunBookConsoleConfig({}), /disabled/);
  const env = {
    DRB_RUNBOOK_CONSOLE: "test",
    DRB_RUNBOOK_GOOGLE_DOC_ID: "synthetic-doc",
    NEXT_PUBLIC_SUPABASE_URL: "https://sbgfuanxiqepcoboxzcl.supabase.co",
    SUPABASE_SECRET_KEY: "synthetic-secret",
  };
  assert.throws(() => getRunBookConsoleConfig(env), /trusted-perimeter/);
  const bound = { ...env, OPERATOR_CONSOLE_CE_ACCESS_MODE: "trusted-perimeter" };
  assert.equal(getRunBookConsoleConfig(bound).volumeId, "synthetic-doc");
  assert.throws(() => getRunBookConsoleConfig({ ...bound, NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co" }), /project mismatch/);
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
