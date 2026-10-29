import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listRuleBookConversationStatus,
  parseRuleBookReviewRequest,
  reviewRuleBookConversation,
} from "../src/lib/rulebook-operator/service";
import {
  getRuleBookOperatorRuntimeConfig,
  RuleBookOperatorUnavailableError,
} from "../src/lib/supabase/server";

test("approved review payload is bounded and excludes privileged scope", () => {
  assert.deepEqual(
    parseRuleBookReviewRequest({
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "approved",
      authorityBasis: "Founder-approved Test egress review",
      evidenceRef: "issue:321",
      approvalHours: 4,
    }),
    {
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "approved",
      authorityBasis: "Founder-approved Test egress review",
      evidenceRef: "issue:321",
      approvalHours: 4,
    },
  );

  for (const privilegedField of [
    "projectKey",
    "destinationKey",
    "reviewerId",
    "tenantKey",
    "projectScopeKey",
    "secretKey",
  ]) {
    assert.throws(
      () => parseRuleBookReviewRequest({
        conversationId: "88888888-8888-4888-8888-888888888881",
        decision: "approved",
        authorityBasis: "attempted caller scope override",
        approvalHours: 1,
        [privilegedField]: "caller-controlled",
      }),
      /Unsupported RuleBook review fields/,
    );
  }
});

test("review decision windows fail closed", () => {
  assert.throws(
    () => parseRuleBookReviewRequest({
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "approved",
      authorityBasis: "missing bounded expiry",
    }),
    /approved reviews require approvalHours/,
  );
  assert.throws(
    () => parseRuleBookReviewRequest({
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "denied",
      authorityBasis: "denial does not expire",
      approvalHours: 1,
    }),
    /denied reviews cannot include approvalHours/,
  );
  assert.deepEqual(
    parseRuleBookReviewRequest({
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "denied",
      authorityBasis: "deny pending independent review",
    }),
    {
      conversationId: "88888888-8888-4888-8888-888888888881",
      decision: "denied",
      authorityBasis: "deny pending independent review",
    },
  );
});

test("protected runtime is disabled unless the trusted perimeter is explicit", () => {
  assert.throws(
    () => getRuleBookOperatorRuntimeConfig({ NODE_ENV: "test" }),
    RuleBookOperatorUnavailableError,
  );
  assert.throws(
    () => getRuleBookOperatorRuntimeConfig({
      NODE_ENV: "test",
      OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE: "trusted-perimeter",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "server-secret",
    }),
    /OPERATOR_CONSOLE_RULEBOOK_REVIEWER_ID/,
  );

  assert.deepEqual(
    getRuleBookOperatorRuntimeConfig({
      NODE_ENV: "test",
      OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE: "trusted-perimeter",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "server-secret",
      OPERATOR_CONSOLE_RULEBOOK_REVIEWER_ID: "operator:test-reviewer",
    }),
    {
      url: "https://example.supabase.co",
      secretKey: "server-secret",
      reviewerId: "operator:test-reviewer",
    },
  );
});

test("service binds reviewer and fixed RPC contract server-side", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "comind_rulebook_operator_review_conversation") {
        return {
          data: {
            review_event_id: "99999999-9999-4999-8999-999999999991",
            conversation_id: args.p_conversation_id,
            destination_key: "OPENAI-API",
            project_key: "COMIND",
            decision: args.p_decision,
            reviewed_at: "2026-10-29T20:00:00.000Z",
            expires_at: "2026-10-29T21:00:00.000Z",
            request_id: args.p_request_id,
          },
          error: null,
        };
      }
      return { data: [], error: null };
    },
  } as unknown as SupabaseClient;

  await reviewRuleBookConversation(client, "operator:server-bound", {
    conversationId: "88888888-8888-4888-8888-888888888881",
    decision: "approved",
    authorityBasis: "bounded test authority",
    approvalHours: 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "comind_rulebook_operator_review_conversation");
  assert.equal(calls[0].args.p_reviewed_by, "operator:server-bound");
  assert.equal(calls[0].args.p_conversation_id, "88888888-8888-4888-8888-888888888881");
  assert.equal(calls[0].args.p_approval_hours, 1);
  assert.equal("p_project_key" in calls[0].args, false);
  assert.equal("p_destination_key" in calls[0].args, false);
  assert.equal("p_tenant_key" in calls[0].args, false);
  assert.equal("p_project_scope_key" in calls[0].args, false);
  assert.match(String(calls[0].args.p_request_id), /^[0-9a-f-]{36}$/i);
});

test("status service uses only the bounded status RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: [], error: null };
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(await listRuleBookConversationStatus(client, 25), []);
  assert.deepEqual(calls, [{
    name: "comind_rulebook_operator_conversation_status",
    args: { p_limit: 25 },
  }]);
  await assert.rejects(() => listRuleBookConversationStatus(client, 201), /between 1 and 200/);
});

test("protected route remains server-mediated and does not accept privileged caller identity", async () => {
  const route = await readFile(
    new URL("../src/app/api/rulebook/conversations/route.ts", import.meta.url),
    "utf8",
  );
  const serverClient = await readFile(
    new URL("../src/lib/supabase/server.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /getRuleBookOperatorRuntimeConfig/);
  assert.match(route, /createRuleBookOperatorSupabaseClient/);
  assert.match(route, /config\.reviewerId/);
  assert.match(route, /x-comind-operator-intent/);
  assert.match(route, /same-origin/);
  assert.doesNotMatch(route, /payload\.reviewerId|payload\.projectKey|payload\.destinationKey/);
  assert.doesNotMatch(route, /secretKey/);

  assert.match(serverClient, /OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE/);
  assert.match(serverClient, /trusted-perimeter/);
  assert.match(serverClient, /typeof window/);
  assert.doesNotMatch(serverClient, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
});
