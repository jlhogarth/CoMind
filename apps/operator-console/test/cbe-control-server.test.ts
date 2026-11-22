import assert from "node:assert/strict";
import test from "node:test";
import { dispatchCbeControlAction, getCbeControlRuntimeConfig } from "../src/lib/cbe-control/server";

const validRequest = { action: "start_browser" };

function env(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    COMIND_CBE_CONTROL_ENDPOINT: "https://cbe.example.test/api/cbe-control",
    COMIND_CBE_CONTROL_TOKEN: "test-capability-token-that-is-not-returned",
    ...overrides,
  };
}

test("runtime config keeps endpoint and bearer capability server-side", () => {
  const config = getCbeControlRuntimeConfig(env());
  assert.equal(config.endpoint, "https://cbe.example.test/api/cbe-control");
  assert.equal(config.token, "test-capability-token-that-is-not-returned");
});

test("dispatch fails closed when endpoint exists but bearer capability is absent", async () => {
  let called = false;
  await assert.rejects(
    () => dispatchCbeControlAction(validRequest, {
      env: env({ COMIND_CBE_CONTROL_TOKEN: "" }),
      fetchImpl: (async () => { called = true; throw new Error("must not call upstream"); }) as typeof fetch,
    }),
    /endpoint and bearer capability must both be configured/
  );
  assert.equal(called, false);
});

test("dispatch sends bearer capability upstream but never returns it", async () => {
  let authorization = "";
  const result = await dispatchCbeControlAction(validRequest, {
    env: env(),
    fetchImpl: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({
        status: "started",
        message: "started",
        correlation_id: "corr-1",
        human_action_required: false,
        human_action_url: null,
      }), { status: 202, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  assert.match(authorization, /^Bearer /);
  assert.equal(JSON.stringify(result).includes("test-capability-token"), false);
});
