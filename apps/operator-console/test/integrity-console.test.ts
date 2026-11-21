import assert from "node:assert/strict";
import { test } from "node:test";
import { INTEGRITY_FRESHNESS_MS, readIntegrityConsoleSnapshot } from "../src/lib/integrity/server";

const SHA = "a".repeat(40);
const TIME = Date.parse("2026-11-21T12:00:00Z");
function registry() {
  const implemented = ["NPH-001", "NDT-001", "NFS-001", "NMC-001", "NRC-001", "NCI-001"];
  const defined = Array.from({ length: 18 }, (_, i) => "TST-" + String(i + 1).padStart(3, "0"));
  return {
    schema_version: 1, registry_id: "COMIND-IIC-REGISTRY",
    implemented_controls: implemented.map((control_id) => ({
      control_id, name: control_id,
      maturity_state: ["NPH-001","NDT-001"].includes(control_id) ? "ENFORCED" : "SHADOW",
      enforcement: { blocking: ["NPH-001","NDT-001"].includes(control_id) },
    })),
    defined_controls: defined.map((control_id) => ({control_id,name:control_id,maturity_state:"DEFINED"})),
  };
}
function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 44875629614, path: ".github/workflows/implementation-integrity.yml",
    head_sha: SHA, head_branch: "main", event: "push",
    status: "completed", conclusion: "success", updated_at: "2026-11-21T11:00:00Z",
    html_url: "https://github.com/jlhogarth/CoMind/actions/runs/44875629614",
    repository: { full_name: "jlhogarth/CoMind" },
    ...overrides,
  };
}
function reader(options: {
  sha?: string; run?: Record<string, unknown> | null;
  registry?: unknown; status?: number;
} = {}) {
  const requests: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    requests.push(url);
    const data = url.includes("/branches/main")
      ? {commit:{sha: options.sha ?? SHA}}
      : url.includes("/contents/config/integrity-registry.v1.json")
      ? { encoding: "base64", content: Buffer.from(JSON.stringify(options.registry ?? registry())).toString("base64") }
      : {workflow_runs: options.run === null ? [] : [options.run ?? workflow()]};
    return new Response(JSON.stringify(data), {
      status: options.status ?? 200, headers: {"content-type":"application/json"},
    });
  };
  return {requests, read: (when = TIME) => readIntegrityConsoleSnapshot(fetcher, () => when)};
}
test("exact main with fresh verified GitHub CI is current, not Production authority", async () => {
  const s = await reader().read();
  assert.equal(s.state, "current");
  assert.equal(s.environment, "Development/Test");
  assert.equal(s.graphAuthority, "not established");
  assert.equal(s.privateRunBook, "unbound");
  assert.equal(s.controls.length, 24);
  assert.equal(s.controls.find(x => x.control_id === "NDT-001")?.enforcement, "blocking");
  assert.equal(s.controls.find(x => x.control_id === "NCI-001")?.enforcement, "nonblocking");
});
test("source is bound to exact revision, never generic latest success", async () => {
  const s = await reader({run:workflow({head_sha:"b".repeat(40)})}).read();
  assert.equal(s.state,"unavailable");
});
test("missing workflow remains unavailable", async () => assert.equal((await reader({run:null}).read()).state,"unavailable"));
test("failed workflow is not verified success", async () =>
  assert.equal((await reader({run:workflow({conclusion:"failure"})}).read()).state,"failed"));
test("in-progress workflow explicitly pending", async () =>
  assert.equal((await reader({run:workflow({status:"in_progress",conclusion:null})}).read()).state,"pending"));
test("stale workflow remains stale", async () =>
  assert.equal((await reader().read(TIME + INTEGRITY_FRESHNESS_MS + 1)).state,"stale"));
test("mismatched source identity fails closed", async () =>
  assert.equal((await reader({run:workflow({repository:{full_name:"elsewhere/repo"}})}).read()).state,"unavailable"));
test("invalid workflow URL fails closed", async () =>
  assert.equal((await reader({run:workflow({html_url:"https://untrusted.invalid/run/1"})}).read()).state,"unavailable"));
test("untrusted registry controls fail closed", async () =>
  assert.equal((await reader({registry:{schema_version:1,registry_id:"COMIND-IIC-REGISTRY",implemented_controls:[],defined_controls:[]}}).read()).state,"unavailable"));
test("source API unavailable, no fabricated statuses", async () =>
  assert.equal((await reader({status:503}).read()).state,"unavailable"));
test("future workflow time is rejected", async () =>
  assert.equal((await reader({run:workflow({updated_at:"2026-11-22T12:00:00Z"})}).read()).state,"unavailable"));
test("reads only pinned GitHub URLs and revision-scoped registry", async () => {
  const r = reader(); await r.read();
  assert.equal(r.requests.length,3);
  assert.ok(r.requests.every(x=>x.startsWith("https://api.github.com/repos/jlhogarth/CoMind/")));
  assert.ok(r.requests.some(x=>x.includes("ref="+SHA)));
});
