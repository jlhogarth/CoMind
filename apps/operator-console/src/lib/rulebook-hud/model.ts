export type RulebookHealth = "healthy" | "warning" | "blocking" | "unknown";
export type RulebookCoverage = "modern_coverage_partial" | "modern_governance_gap" | "modern_coverage_adequate";

export type RulebookControlRow = {
  control_key: string;
  layer0_section: number;
  family_name: string;
  source_coverage_state: RulebookCoverage;
  remediation_state: string;
  health_state: RulebookHealth;
  requirements_total: number;
  verified_count: number;
  operational_count: number;
  open_exception_count: number;
  last_runtime_decision_at: string | null;
  last_checked_at: string;
  next_review_at: string | null;
  coverage_note: string;
  is_synthetic: boolean;
  refreshed_at: string;
};

export function completionRatio(row: RulebookControlRow): number {
  if (row.requirements_total <= 0) return 0;
  return row.verified_count / row.requirements_total;
}

export function needsRulebookAttention(row: RulebookControlRow): boolean {
  return row.health_state === "blocking"
    || row.health_state === "warning"
    || row.verified_count < row.requirements_total
    || row.open_exception_count > 0;
}

export function sortRulebookRows(rows: RulebookControlRow[]): RulebookControlRow[] {
  const rank: Record<RulebookHealth, number> = { blocking: 0, warning: 1, unknown: 2, healthy: 3 };
  return [...rows].sort((a, b) => {
    const health = rank[a.health_state] - rank[b.health_state];
    return health !== 0 ? health : a.layer0_section - b.layer0_section;
  });
}
