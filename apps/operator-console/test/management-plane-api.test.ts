import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/management-plane/route";

const originalFetch = global.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const originalCapability = process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY;

function restore() {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalPublishableKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalPublishableKey;
  if (originalCapability === undefined) delete process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY; else process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY = originalCapability;
}
test.afterEach(restore);

function configure() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://sbgfuanxiqepcoboxzcl.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_management_plane_test_only";
  process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY = "synthetic-management-plane-capability-for-api-test-20261030";
}

const snapshot = {
  generated_at: "2026-10-30T17:00:00Z",
  coverage_limit: "durable snapshot only",
  authority: { active: true, authority_level: "L4A", production_authority: false },
  blockers: [], lanes: [], controllers: [],
};

test("uses the publishable-key channel plus server capability and returns neither secret", async () => {
  configure();
  let authHeader = "";
  let requestBody = "";
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/rest\/v1\/rpc\/operator_console_l4a_management_plane$/);
    const headers = new Headers(init?.headers);
    authHeader = headers.get("authorization") ?? "";
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(authHeader, /sb_publishable_management_plane_test_only/);
  assert.match(requestBody, /synthetic-management-plane-capability-for-api-test-20261030/);
  const body = await response.text();
  assert.doesNotMatch(body, /sb_publishable_management_plane_test_only/);
  assert.doesNotMatch(body, /synthetic-management-plane-capability-for-api-test-20261030/);
});

test("fails closed when the management capability is absent", async () => {
  configure(); delete process.env.OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY;
  let called = false;
  global.fetch = (async () => { called = true; throw new Error("must not call"); }) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("does not relay upstream database details for invalid capability or upstream denial", async () => {
  configure();
  global.fetch = (async () => new Response(JSON.stringify({ message: "Operator Console management capability denied" }), { status: 403, headers: { "content-type": "application/json" } })) as typeof fetch;
  const response = await GET();
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.doesNotMatch(body, /capability denied/);
  assert.match(body, /governed management plane is unavailable/);
});
