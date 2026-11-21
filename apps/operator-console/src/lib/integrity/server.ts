// Server-rendered route dependency only. No client import or browser credential path.

export const INTEGRITY_SOURCE_REPOSITORY = "jlhogarth/CoMind";
export const INTEGRITY_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const API = "https://api.github.com/repos/jlhogarth/CoMind";
const WORKFLOW = ".github/workflows/implementation-integrity.yml";
const SHA = /^[a-f0-9]{40}$/;
const CONTROL = /^[A-Z0-9]+-\d{3}$/;
const STATES = ["DEFINED", "SHADOW", "PROVEN", "ENFORCED", "GOVERNED"] as const;

export type RegistryControl = {
  control_id: string;
  name: string;
  maturity_state: typeof STATES[number];
  enforcement: "blocking" | "nonblocking" | "not implemented";
};
export type ConsoleIntegrityState = "current" | "stale" | "failed" | "pending" | "unavailable";
export type IntegrityConsoleSnapshot = {
  state: ConsoleIntegrityState;
  observedAt: string;
  sourceRecordedAt: string | null;
  expiresAt: string | null;
  revision: string | null;
  runId: number | null;
  runUrl: string | null;
  sourceConclusion: string | null;
  controls: RegistryControl[];
  source: "GitHub Actions + canonical CoMind Integrity Registry";
  environment: "Development/Test";
  graphAuthority: "not established";
  privateRunBook: "unbound";
  coverage: "Exact-main GitHub CI status only; not application, RunBook, AED, or Production verification";
  explanation: string;
};

type HttpFetch = (input: string, init: RequestInit) => Promise<Response>;

function isObject(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === "object" && !Array.isArray(data);
}
function parseTime(input: unknown): number | null {
  if (typeof input !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(input)) return null;
  const time = Date.parse(input);
  return Number.isFinite(time) ? time : null;
}
function parseRegistry(payload: unknown): RegistryControl[] {
  if (!isObject(payload) || payload.registry_id !== "COMIND-IIC-REGISTRY"
      || payload.schema_version !== 1 || !Array.isArray(payload.implemented_controls)
      || !Array.isArray(payload.defined_controls)) throw new Error("invalid registry");
  const controls = [...payload.implemented_controls, ...payload.defined_controls];
  if (controls.length !== 24) throw new Error("incomplete registry");
  const names = new Set<string>();
  return controls.map((value: unknown) => {
    if (!isObject(value) || typeof value.control_id !== "string"
        || !CONTROL.test(value.control_id) || names.has(value.control_id)
        || typeof value.name !== "string" || !value.name.trim()
        || !STATES.includes(value.maturity_state as typeof STATES[number]))
      throw new Error("invalid control");
    names.add(value.control_id);
    const enforcement = value.enforcement;
    let blocking = false;
    if (value.maturity_state !== "DEFINED") {
      if (!isObject(enforcement) || typeof enforcement.blocking !== "boolean")
        throw new Error("invalid enforcement");
      blocking = enforcement.blocking;
      if (value.maturity_state === "ENFORCED" && !blocking)
        throw new Error("enforcement contradiction");
      if (["SHADOW", "PROVEN"].includes(value.maturity_state as string) && blocking)
        throw new Error("shadow control blocking contradiction");
    }
    return {
      control_id: value.control_id,
      name: value.name,
      maturity_state: value.maturity_state as RegistryControl["maturity_state"],
      enforcement: value.maturity_state === "DEFINED" ? "not implemented" as const
        : blocking ? "blocking" as const : "nonblocking" as const,
    };
  }).sort((a, b) => a.control_id.localeCompare(b.control_id));
}
function unavailable(observedAt: string, reason: string): IntegrityConsoleSnapshot {
  return {
    state: "unavailable", observedAt, sourceRecordedAt: null, expiresAt: null,
    revision: null, runId: null, runUrl: null, sourceConclusion: null,
    controls: [], source: "GitHub Actions + canonical CoMind Integrity Registry",
    environment: "Development/Test", graphAuthority: "not established",
    privateRunBook: "unbound",
    coverage: "Exact-main GitHub CI status only; not application, RunBook, AED, or Production verification",
    explanation: reason,
  };
}
async function getJson(fetcher: HttpFetch, url: string, limit = 600_000): Promise<unknown> {
  const response = await fetcher(url, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(5_000),
    next: { revalidate: 60 },
  } as RequestInit);
  if (!response.ok) throw new Error("source HTTP failure");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > limit) throw new Error("source too large");
  const body = await response.text();
  if (body.length > limit) throw new Error("source too large");
  return JSON.parse(body) as unknown;
}

export async function readIntegrityConsoleSnapshot(
  fetcher: HttpFetch = fetch,
  clock: () => number = Date.now,
): Promise<IntegrityConsoleSnapshot> {
  const now = clock();
  const observedAt = new Date(now).toISOString();
  const absent = (reason: string) => unavailable(observedAt, reason);
  try {
    const branch = await getJson(fetcher, API + "/branches/main", 30_000);
    if (!isObject(branch) || !isObject(branch.commit) ||
        typeof branch.commit.sha !== "string" || !SHA.test(branch.commit.sha))
      return absent("Current main revision could not be verified.");
    const sha = branch.commit.sha;
    const [rawRegistry, rawWorkflows] = await Promise.all([
      getJson(fetcher, API + "/contents/config/integrity-registry.v1.json?ref=" + sha),
      getJson(fetcher, API + "/actions/workflows/implementation-integrity.yml/runs?branch=main&per_page=10"),
    ]);
    if (!isObject(rawRegistry) || rawRegistry.encoding !== "base64"
      || typeof rawRegistry.content !== "string") return absent("Revision-bound registry unavailable.");
    const registry = JSON.parse(Buffer.from(rawRegistry.content, "base64").toString("utf8")) as unknown;
    const controls = parseRegistry(registry);
    if (!isObject(rawWorkflows) || !Array.isArray(rawWorkflows.workflow_runs))
      return absent("GitHub Actions evidence unavailable.");
    const runs = rawWorkflows.workflow_runs;
    const run = runs.find((value: unknown) => isObject(value) && value.head_sha === sha
      && value.head_branch === "main" && value.event === "push");
    const base = {
      ...unavailable(observedAt, "No current-main integrity workflow evidence."),
      revision: sha, controls,
    };
    if (!isObject(run)) return { ...base, state: "unavailable" };
    if (run.path !== WORKFLOW || !isObject(run.repository)
      || run.repository.full_name !== INTEGRITY_SOURCE_REPOSITORY
      || !Number.isSafeInteger(run.id) || Number(run.id) <= 0
      || run.html_url !== "https://github.com/" + INTEGRITY_SOURCE_REPOSITORY + "/actions/runs/" + run.id)
      return absent("Workflow source identity mismatch.");
    const recorded = parseTime(run.updated_at);
    if (recorded === null || recorded > now + 60_000)
      return absent("Workflow observation time invalid.");
    const expiresAt = new Date(recorded + INTEGRITY_FRESHNESS_MS).toISOString();
    const conclusion = typeof run.conclusion === "string" ? run.conclusion : null;
    const state: ConsoleIntegrityState =
      run.status !== "completed" ? "pending"
      : now - recorded > INTEGRITY_FRESHNESS_MS ? "stale"
      : conclusion === "success" ? "current" : "failed";
    return {
      ...base,
      state,
      sourceRecordedAt: new Date(recorded).toISOString(),
      expiresAt,
      runId: run.id as number,
      runUrl: run.html_url as string,
      sourceConclusion: conclusion,
      explanation: state === "current"
        ? "Exact-main GitHub integrity workflow succeeded within the 24-hour source freshness contract. This verifies that workflow result only."
        : state === "pending" ? "Exact-main integrity workflow has not completed."
        : state === "stale" ? "Workflow evidence is older than the 24-hour source freshness contract."
        : "Exact-main integrity workflow did not report success.",
    };
  } catch {
    return absent("GitHub integrity evidence or registry could not be read and validated.");
  }
}
