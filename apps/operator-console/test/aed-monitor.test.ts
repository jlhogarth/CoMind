import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleAedGet } from "../src/lib/aed-monitor/http";
import { authorizeAed, getAedConfig, parseExecutionId, parsePage } from "../src/lib/aed-monitor/server";

const owner = "123e4567-e89b-42d3-a456-426614174000";
const other = "123e4567-e89b-42d3-a456-426614174001";
const env = {
  OPERATOR_CONSOLE_AED_ACCESS_MODE: "enabled",
  NEXT_PUBLIC_SUPABASE_URL: "https://sbgfuanxiqepcoboxzcl.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  SUPABASE_SECRET_KEY: "server-only-test-key",
  OPERATOR_CONSOLE_AED_OPERATOR_IDS: owner,
};
const config = getAedConfig(env);
const id = "580f3fad73905c8230b2bfc8";

test("AED configuration fails closed without credentials, mode and explicit operator identities", () => {
  assert.throws(() => getAedConfig({}), /disabled/);
  assert.throws(() => getAedConfig({ ...env, SUPABASE_SECRET_KEY: undefined }), /SUPABASE_SECRET_KEY/);
  assert.throws(() => getAedConfig({ ...env, OPERATOR_CONSOLE_AED_OPERATOR_IDS: "everyone" }), /Invalid operator/);
});

test("Supabase Auth validates token identity and explicit operator authorization", async () => {
  const fake = (userId: string | null) => ({ auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) } }) as unknown as SupabaseClient;
  assert.equal(await authorizeAed(null, config, fake(owner)), "unauthenticated");
  assert.equal(await authorizeAed("Bearer invalid", config, fake(null)), "unauthenticated");
  assert.equal(await authorizeAed("Bearer valid", config, fake(other)), "forbidden");
  assert.equal(await authorizeAed("Bearer valid", config, fake(owner)), "authorized");
});

test("AED parameter validation rejects arbitrary queries, invalid identifiers and unbounded pages", () => {
  assert.throws(() => parseExecutionId("../../public.users"));
  for (const query of ["page=0", "page=1.5", "pageSize=101", "state=x,y", "orderBy=payload", "page=10001"]) {
    assert.throws(() => parsePage(new URLSearchParams(query)), query);
  }
});

function fakeReader(fail = false) {
  const calls: Array<{ table: string; selection: string; filters: Array<[string, unknown]>; range: number[] }> = [];
  const reader = {
    schema(schema: string) {
      assert.equal(schema, "comind_pm");
      return { from(table: string) {
        assert.ok(["pm_aed_monitor_execution", "pm_aed_monitor_event"].includes(table));
        const call = { table, selection: "", filters: [] as Array<[string, unknown]>, range: [] as number[] };
        calls.push(call);
        const query = {
          select(selection: string) { call.selection = selection; assert.ok(!selection.includes("payload,")); return query; },
          eq(column: string, value: unknown) { call.filters.push([column, value]); return query; },
          order() { return query; },
          range(start: number, end: number) { call.range = [start, end]; return query; },
          maybeSingle: async () => fail ? { data: null, error: { message: "upstream" } } : { data: { execution_id: id, event_count: 65 }, error: null },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve(resolve(fail ? { data: null, error: { message: "upstream" } } : {
              data: table.endsWith("event") ? [{ sequence: call.range[0] + 1, payload_sha256: "a".repeat(64) }] : [{ execution_id: id }],
              count: table.endsWith("event") ? 65 : 3, error: null,
            }));
          },
        };
        return query;
      } };
    },
  } as unknown as SupabaseClient;
  return { reader, calls };
}

const request = (path: string, authorized = true) => new Request(`https://console.example.test${path}`, { headers: authorized ? { Authorization: "Bearer valid" } : {} });
const injected = (status: "authorized" | "forbidden" | "unauthenticated", reader: SupabaseClient) => ({
  config: () => config, authorize: async () => status, reader: () => reader,
});

test("application handler rejects missing and unauthorized identity before database access", async () => {
  const { reader, calls } = fakeReader();
  assert.equal((await handleAedGet(request("/api/aed/executions", false), undefined, injected("unauthenticated", reader))).status, 401);
  assert.equal((await handleAedGet(request("/api/aed/executions"), undefined, injected("forbidden", reader))).status, 403);
  assert.equal(calls.length, 0);
});

test("application handler retrieves bounded ordered pages and excludes raw payload", async () => {
  const { reader, calls } = fakeReader();
  const history = await handleAedGet(request("/api/aed/executions?page=2&pageSize=25"), undefined, injected("authorized", reader));
  assert.equal(history.status, 200);
  assert.equal((await history.json()).total, 3);
  assert.deepEqual(calls[0].range, [25, 49]);
  const detail = await handleAedGet(request(`/api/aed/executions/${id}?page=3&pageSize=25&state=RECOVERED`), id, injected("authorized", reader));
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).rows[0].sequence, 51);
  assert.deepEqual(calls[2].range, [50, 74]);
  assert.ok(calls[2].filters.some(([key]) => key === "state"));
  assert.ok(!calls[2].selection.includes("payload,"));
  assert.equal(detail.headers.get("cache-control"), "private, no-store");
});

test("application handler reports invalid requests, absent configuration and upstream failure without privileged fallback", async () => {
  const { reader, calls } = fakeReader(true);
  assert.equal((await handleAedGet(request(`/api/aed/executions/${id}?pageSize=1000`), id, injected("authorized", reader))).status, 400);
  assert.equal((await handleAedGet(request("/api/aed/executions"), undefined, { config: () => getAedConfig({}) })).status, 503);
  assert.equal((await handleAedGet(request("/api/aed/executions"), undefined, injected("authorized", reader))).status, 503);
  assert.equal(calls.length, 1);
});
