import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/activity/route";

const originalFetch = global.fetch;
const originalEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  capability: process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY,
};

function restore() {
  global.fetch = originalFetch;
  if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalEnv.key;
  if (originalEnv.capability === undefined) delete process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY;
  else process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY = originalEnv.capability;
}

test.afterEach(restore);

const operationalRow = {
  activity_id: "00000000-0000-4000-8000-000000000001",
  activity_key: "CE-002",
  source_system: "github",
  source_ref: "https://github.com/jlhogarth/CoMind/pull/345",
  title: "Recovery and Reorientation Protocol automation",
  owner_label: "Joseph Hogarth",
  started_at: "2026-10-30T05:30:13Z",
  expected_deadline_at: null,
  stale_after_seconds: 0,
  latest_observation_id: "00000000-0000-4000-8000-000000000002",
  latest_event_type: "verification",
  last_reported_status: "review",
  last_source_event_ref: "https://github.com/jlhogarth/CoMind/pull/345",
  last_source_occurred_at: "2026-10-30T07:32:59Z",
  last_observed_at: "2026-10-30T07:32:59Z",
  last_observation_summary: "Ready for human review.",
  last_evidence: { work_key: "CE-002", event_type: "verification" },
  hud_state: "awaiting_review",
  evidence_based_resolution: null,
  has_terminal_source_evidence: false,
  is_synthetic: false,
  coverage_limit: "Bounded projection.",
};

function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sbgfuanxiqepcoboxzcl.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
  process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY = "hud-real-001-server-capability-000000000000";
}

test("passes the server-only capability to the bounded Supabase RPC and never returns it", async () => {
  configure();
  let receivedBody: Record<string, unknown> | undefined;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/operator_console_activity_feed$/);
    receivedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify([operationalRow]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const response = await GET(new NextRequest("http://localhost/api/activity?scope=operational"));
  assert.equal(response.status, 200);
  assert.deepEqual(receivedBody, {
    p_capability: "hud-real-001-server-capability-000000000000",
    p_scope: "operational",
    p_limit: 1000,
  });
  const text = await response.text();
  assert.doesNotMatch(text, /hud-real-001-server-capability/);
  const payload = JSON.parse(text) as { rows: unknown[]; scope: string };
  assert.equal(payload.scope, "operational");
  assert.equal(payload.rows.length, 1);
});

test("rejects unsupported scopes before calling Supabase", async () => {
  configure();
  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error("must not be called");
  }) as typeof fetch;
  const response = await GET(new NextRequest("http://localhost/api/activity?scope=private"));
  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("fails closed when the server-only capability is missing", async () => {
  configure();
  delete process.env.OPERATOR_CONSOLE_ACTIVITY_CAPABILITY;
  let called = false;
  global.fetch = (async () => {
    called = true;
    throw new Error("must not be called");
  }) as typeof fetch;
  const response = await GET(new NextRequest("http://localhost/api/activity?scope=operational"));
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("does not relay upstream Supabase error bodies to the browser", async () => {
  configure();
  global.fetch = (async () => new Response(
    JSON.stringify({ message: "secret database detail that must not be relayed" }),
    { status: 403, headers: { "content-type": "application/json" } },
  )) as typeof fetch;
  const response = await GET(new NextRequest("http://localhost/api/activity?scope=operational"));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.doesNotMatch(text, /secret database detail/);
  assert.match(text, /governed Activity HUD source is unavailable/);
});
