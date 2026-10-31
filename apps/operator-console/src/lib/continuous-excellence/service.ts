import type { SupabaseClient } from "@supabase/supabase-js";

export interface ContinuousExcellenceSummary {
  generated_at: string;
  signal_count: number;
  actionable_backlog_count: number;
  recovery_interrupt_count: number;
  current_capsule_count: number;
  recovery_ready_count: number;
  recovery_attention_count: number;
  improvement_count: number;
  validated_improvement_count: number;
  latest_signal_at: string | null;
  latest_capsule_at: string | null;
}

export interface ContinuousExcellenceStateCount {
  dimension: "signal_type" | "severity" | "recovery_state" | "improvement_state";
  state: string;
  item_count: number;
}

export interface ContinuousExcellenceSnapshot {
  summary: ContinuousExcellenceSummary;
  states: ContinuousExcellenceStateCount[];
}

const allowedDimensions = new Set<ContinuousExcellenceStateCount["dimension"]>([
  "signal_type",
  "severity",
  "recovery_state",
  "improvement_state",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string): number {
  const normalized = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return normalized;
}

function timestamp(value: unknown, label: string, nullable = false): string | null {
  if (value == null && nullable) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be an ISO-compatible timestamp${nullable ? " or null" : ""}`);
  }
  return value;
}

function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be non-empty text`);
  }
  return value.trim();
}

export function parseContinuousExcellenceSummary(value: unknown): ContinuousExcellenceSummary {
  const input = record(value, "Continuous Excellence summary");
  return {
    generated_at: timestamp(input.generated_at, "generated_at") as string,
    signal_count: integer(input.signal_count, "signal_count"),
    actionable_backlog_count: integer(input.actionable_backlog_count, "actionable_backlog_count"),
    recovery_interrupt_count: integer(input.recovery_interrupt_count, "recovery_interrupt_count"),
    current_capsule_count: integer(input.current_capsule_count, "current_capsule_count"),
    recovery_ready_count: integer(input.recovery_ready_count, "recovery_ready_count"),
    recovery_attention_count: integer(input.recovery_attention_count, "recovery_attention_count"),
    improvement_count: integer(input.improvement_count, "improvement_count"),
    validated_improvement_count: integer(input.validated_improvement_count, "validated_improvement_count"),
    latest_signal_at: timestamp(input.latest_signal_at, "latest_signal_at", true),
    latest_capsule_at: timestamp(input.latest_capsule_at, "latest_capsule_at", true),
  };
}

export function parseContinuousExcellenceStateCounts(value: unknown): ContinuousExcellenceStateCount[] {
  if (!Array.isArray(value)) throw new Error("Continuous Excellence state counts must be an array");
  return value.map((row, index) => {
    const input = record(row, `Continuous Excellence state row ${index}`);
    const dimension = nonEmptyText(input.dimension, `state row ${index} dimension`);
    if (!allowedDimensions.has(dimension as ContinuousExcellenceStateCount["dimension"])) {
      throw new Error(`Unsupported Continuous Excellence state dimension: ${dimension}`);
    }
    return {
      dimension: dimension as ContinuousExcellenceStateCount["dimension"],
      state: nonEmptyText(input.state, `state row ${index} state`),
      item_count: integer(input.item_count, `state row ${index} item_count`),
    };
  });
}

export async function readContinuousExcellenceSnapshot(
  client: SupabaseClient,
): Promise<ContinuousExcellenceSnapshot> {
  const [summaryResult, statesResult] = await Promise.all([
    client.from("v_ce_operator_summary").select("*").single(),
    client.from("v_ce_operator_state_counts").select("*").order("dimension").order("state"),
  ]);

  if (summaryResult.error) {
    throw new Error(`Continuous Excellence summary query failed: ${summaryResult.error.message}`);
  }
  if (statesResult.error) {
    throw new Error(`Continuous Excellence state query failed: ${statesResult.error.message}`);
  }

  return {
    summary: parseContinuousExcellenceSummary(summaryResult.data),
    states: parseContinuousExcellenceStateCounts(statesResult.data),
  };
}
