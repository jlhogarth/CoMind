import assert from "node:assert/strict";
import test from "node:test";

import {
  parseContinuousExcellenceStateCounts,
  parseContinuousExcellenceSummary,
} from "../src/lib/continuous-excellence/service";
import {
  ContinuousExcellenceUnavailableError,
  getContinuousExcellenceRuntimeConfig,
} from "../src/lib/continuous-excellence/server";

test("Continuous Excellence summary parser accepts Postgres bigint strings without losing integrity", () => {
  const summary = parseContinuousExcellenceSummary({
    generated_at: "2026-10-29T21:00:00.000Z",
    signal_count: "12",
    actionable_backlog_count: 3,
    recovery_interrupt_count: "2",
    current_capsule_count: 5,
    recovery_ready_count: 4,
    recovery_attention_count: 1,
    improvement_count: 7,
    validated_improvement_count: 6,
    latest_signal_at: null,
    latest_capsule_at: "2026-10-29T20:59:00.000Z",
  });

  assert.equal(summary.signal_count, 12);
  assert.equal(summary.actionable_backlog_count, 3);
  assert.equal(summary.latest_signal_at, null);
  assert.equal(summary.latest_capsule_at, "2026-10-29T20:59:00.000Z");
});

test("Continuous Excellence state parser rejects unsupported dimensions", () => {
  assert.throws(
    () => parseContinuousExcellenceStateCounts([
      { dimension: "secret_payload", state: "x", item_count: 1 },
    ]),
    /Unsupported Continuous Excellence state dimension/,
  );
});

test("Continuous Excellence state parser preserves bounded aggregate state", () => {
  const rows = parseContinuousExcellenceStateCounts([
    { dimension: "recovery_state", state: "ready", item_count: "4" },
    { dimension: "improvement_state", state: "validated", item_count: 2 },
  ]);

  assert.deepEqual(rows, [
    { dimension: "recovery_state", state: "ready", item_count: 4 },
    { dimension: "improvement_state", state: "validated", item_count: 2 },
  ]);
});

test("Continuous Excellence protected runtime fails closed unless trusted perimeter is explicit", () => {
  assert.throws(
    () => getContinuousExcellenceRuntimeConfig({} as NodeJS.ProcessEnv),
    ContinuousExcellenceUnavailableError,
  );

  const config = getContinuousExcellenceRuntimeConfig({
    OPERATOR_CONSOLE_CE_ACCESS_MODE: "trusted-perimeter",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "test-secret",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(config, {
    url: "https://example.supabase.co",
    secretKey: "test-secret",
  });
});
