import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/agent-work/route";

const saved = {
  fetch: global.fetch,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  capability: process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY,
};
test.afterEach(() => {
  global.fetch = saved.fetch;
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", saved.url],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", saved.key],
    ["OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY", saved.capability],
  ] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sbgfuanxiqepcoboxzcl.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_agent_work_test";
  process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY = "synthetic-agent-work-read-capability-20261112";
}
const snapshot = {
  schema_version: "comind.agcol-003.operator-work.v1", generated_at: "2026-11-12T01:20:00Z",
  coverage_limit: "Latest 20 Test run manifests, up to 32 tasks each",
  activation_mode: "bounded_test_invocation", always_running: false,
  work: [{
    run_key: "synthetic-run", manifest_id: "manifest", manifest_at: "2026-11-12T01:19:00Z",
    specialist_key: "research", profile_id: "profile", task_id: "task", capability_code: "read_resource",
    progress_id: "progress", observed_at: "2026-11-12T01:20:00Z", phase: "completed",
    blocker_code: null, result_ref: "result", lease_state: "completed", lease_expires_at: null,
    lease_updated_at: "2026-11-12T01:20:00Z", fencing_epoch: 1, attention: "complete",
  }],
};

test("returns bounded agent work without forwarding the server capability", async () => {
  configure();
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/operator_console_agcol_work$/);
    assert.match(String(init?.body), /synthetic-agent-work-read-capability-20261112/);
    return new Response(JSON.stringify(snapshot), { status: 200 });
  }) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), snapshot);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
});

test("fails closed without capability and on upstream denial or malformed projection", async () => {
  configure(); delete process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY;
  let called = false;
  global.fetch = (async () => { called = true; throw new Error("unexpected request"); }) as typeof fetch;
  assert.equal((await GET()).status, 503); assert.equal(called, false);
  configure();
  global.fetch = (async () => new Response("private denial", { status: 403 })) as typeof fetch;
  const denied = await GET(); assert.equal(denied.status, 502);
  assert.doesNotMatch(await denied.text(), /private denial/);
  global.fetch = (async () => new Response(JSON.stringify({ ...snapshot, always_running: true }), { status: 200 })) as typeof fetch;
  assert.equal((await GET()).status, 502);
});
