import { Client } from "pg";

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
  if (environment.VERCEL_ENV !== "preview" || environment.DRB_RUNBOOK_CONSOLE_ACCESS !== "trusted-test-perimeter") {
    throw new Error("RunBook Console requires a protected Test preview");
  }
  const database = environment.DRB_RUNBOOK_CONSOLE_DATABASE_URL;
  if (!database) throw new Error("RunBook Console database binding is missing");
  const url = new URL(database);
  const ref = "sbgfuanxiqepcoboxzcl";
  const login = "comind_runbook_console_login";
  const direct = url.hostname === `db.${ref}.supabase.co` && url.username === login;
  const pooled = url.hostname.endsWith(".pooler.supabase.com") && url.username === `${login}.${ref}`;
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !(direct || pooled)
    || url.pathname !== "/postgres" || url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("RunBook Console requires the scoped TLS binding to CoMind Test");
  }
  return database;
}

export async function readRunBookLifecycleStatus() {
  const client = new Client({
    connectionString: getRunBookConsoleConfig(),
    connectionTimeoutMillis: 4_000,
    query_timeout: 5_000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT comind_drb_test.console_status() AS status");
    return parseRunBookLifecycleStatus(rows[0]?.status);
  } finally {
    await client.end();
  }
}
