import assert from "node:assert/strict";
import test from "node:test";

import { validateAdminMutationRequest } from "../src/lib/admin/request";

const requestId = "123e4567-e89b-42d3-a456-426614174000";

test("validates a bounded insert request", () => {
  const request = validateAdminMutationRequest({
    requestId,
    actor: "operator",
    operation: "insert",
    schema: "public",
    relation: "operator_console_verification_records",
    values: { record_key: "smoke", payload: { stage: "test" } },
    provenance: { issue: 118 },
  });

  assert.equal(request.relation, "operator_console_verification_records");
  assert.equal(request.operation, "insert");
});

test("rejects schema expansion, invalid identifiers, and unscoped updates", () => {
  assert.throws(
    () => validateAdminMutationRequest({
      requestId,
      actor: "operator",
      operation: "insert",
      schema: "comind",
      relation: "cm_agent",
      values: { name: "x" },
    }),
    /restricted to the public schema/,
  );

  assert.throws(
    () => validateAdminMutationRequest({
      requestId,
      actor: "operator",
      operation: "insert",
      schema: "public",
      relation: "users;drop table users",
      values: { display_name: "x" },
    }),
    /valid PostgreSQL identifier/,
  );

  assert.throws(
    () => validateAdminMutationRequest({
      requestId,
      actor: "operator",
      operation: "update",
      schema: "public",
      relation: "users",
      values: { display_name: "x" },
    }),
    /require a primary-key object/,
  );
});
