import assert from "node:assert/strict";
import { test } from "node:test";
import { completionRatio, needsRulebookAttention, sortRulebookRows, type RulebookControlRow } from "../src/lib/rulebook-hud/model";

function row(overrides: Partial<RulebookControlRow> = {}): RulebookControlRow {
  return {
    control_key: "DRULE-C03",
    layer0_section: 3,
    family_name: "Data Classification & Tagging",
    source_coverage_state: "modern_governance_gap",
    remediation_state: "implemented_test",
    health_state: "warning",
    requirements_total: 3,
    verified_count: 2,
    operational_count: 0,
    open_exception_count: 0,
    last_runtime_decision_at: null,
    last_checked_at: "2026-10-28T20:00:00Z",
    next_review_at: "2026-11-27T20:00:00Z",
    coverage_note: "status only",
    is_synthetic: true,
    refreshed_at: "2026-10-28T20:00:00Z",
    ...overrides,
  };
}

test("completion ratio is bounded by verified requirement count", () => {
  assert.equal(completionRatio(row()), 2 / 3);
  assert.equal(completionRatio(row({ requirements_total: 0, verified_count: 0 })), 0);
});

test("attention includes warnings, blockers, incomplete verification and open exceptions", () => {
  assert.equal(needsRulebookAttention(row()), true);
  assert.equal(needsRulebookAttention(row({ health_state: "healthy", verified_count: 3 })), false);
  assert.equal(needsRulebookAttention(row({ health_state: "healthy", verified_count: 3, open_exception_count: 1 })), true);
});

test("sorting prioritizes blockers then warnings before section order", () => {
  const rows = sortRulebookRows([
    row({ control_key: "DRULE-C13", layer0_section: 13, health_state: "healthy", verified_count: 3 }),
    row({ control_key: "DRULE-C17", layer0_section: 17, health_state: "blocking" }),
    row({ control_key: "DRULE-C04", layer0_section: 4, health_state: "warning" }),
  ]);
  assert.deepEqual(rows.map((item) => item.control_key), ["DRULE-C17", "DRULE-C04", "DRULE-C13"]);
});
