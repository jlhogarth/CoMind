import {
  createContinuousExcellenceSupabaseClient,
  getContinuousExcellenceRuntimeConfig,
} from "../continuous-excellence/server";

const states = ["waiting", "missed", "conflicting_receipts", "measurement_failed", "late", "current"] as const;
type Receipt = {
  id: string;
  observed_at: string;
  trigger: "probe" | "scheduled";
  size: "below_review" | "review" | "escalation" | "invalid" | "unavailable";
  units: number | null;
  rollover: "blocked" | "ready_for_review";
  policy_version: number;
};
type LifecycleStatus = {
  due_at: string;
  state: typeof states[number];
  scheduled_receipt_id: string | null;
  latest: Receipt | null;
};

export function parseRunBookLifecycleStatus(data: unknown): LifecycleStatus {
  const value = data as LifecycleStatus | null;
  const isDate = (input: unknown) => typeof input === "string" && Number.isFinite(Date.parse(input));
  if (!value || !states.includes(value.state) || !isDate(value.due_at)
    || (value.scheduled_receipt_id !== null && typeof value.scheduled_receipt_id !== "string")) {
    throw new Error("Invalid RunBook status");
  }
  const latest = value.latest;
  if (latest !== null && (!latest || typeof latest.id !== "string" || !isDate(latest.observed_at)
    || !["scheduled", "probe"].includes(latest.trigger)
    || !["below_review", "review", "escalation", "invalid", "unavailable"].includes(latest.size)
    || !["blocked", "ready_for_review"].includes(latest.rollover)
    || (latest.units !== null && (!Number.isSafeInteger(latest.units) || latest.units < 0))
    || !Number.isSafeInteger(latest.policy_version))) throw new Error("Invalid RunBook receipt");
  return value;
}

export function getRunBookConsoleConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  if (environment.DRB_RUNBOOK_CONSOLE !== "test") throw new Error("RunBook Test status disabled");
  const volumeId = environment.DRB_RUNBOOK_GOOGLE_DOC_ID;
  if (!volumeId || !/^[A-Za-z0-9_-]{1,160}$/.test(volumeId)) throw new Error("RunBook document not configured");
  const runtime = getContinuousExcellenceRuntimeConfig(environment);
  if (runtime.url !== "https://sbgfuanxiqepcoboxzcl.supabase.co") throw new Error("RunBook Test project mismatch");
  return { runtime, volumeId };
}

export async function readRunBookLifecycleStatus() {
  const { runtime, volumeId } = getRunBookConsoleConfig();
  const client = createContinuousExcellenceSupabaseClient(runtime);
  const { data, error } = await client.rpc("comind_runbook_lifecycle_status", { volume_id: volumeId })
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw new Error("RunBook status read failed");
  return parseRunBookLifecycleStatus(data);
}
