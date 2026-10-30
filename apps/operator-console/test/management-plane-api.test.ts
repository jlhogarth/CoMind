import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/management-plane/route";

const originalFetch = global.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;

function restore() {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
}
test.afterEach(restore);

function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sbgfuanxiqepcoboxzcl.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_management_plane_test_only";
}

const snapshot = {
  generated_at: "2026-10-30T17:00:00Z",
  coverage_limit: "durable snapshot only",
  authority: { active: true, authority_level: "L4A", production_authority: false },
  blockers: [],
  lanes: [],
  controllers: [],
};

test("uses the server secret for the RPC but never returns it", async () => {
  configure();
  let authHeader = "";
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/operator_console_l4a_management_plane$/);
    const headers = new Headers(init?.headers);
    authHeader = headers.get("authorization") ?? "";
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(authHeader, /sb_secret_management_plane_test_only/);
  const body = await response.text();
  assert.doesNotMatch(body, /sb_secret_management_plane_test_only/);
});

test("fails closed when the server secret is absent", async () => {
  configure(); delete process.env.SUPABASE_SECRET_KEY;
  let called = false;
  global.fetch = (async () => { called = true; throw new Error("must not call"); }) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("does not relay upstream database details", async () => {
  configure();
  global.fetch = (async () => new Response(JSON.stringify({ message: "private database detail" }), { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.doesNotMatch(body, /private database detail/);
  assert.match(body, /governed management plane is unavailable/);
});
