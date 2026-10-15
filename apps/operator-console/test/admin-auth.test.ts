import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedAdminBearer } from "../src/lib/admin/auth";
import { getAdminExecutionConfig } from "../src/lib/admin/config";

const token = "0123456789abcdef0123456789abcdef";

test("administrative execution is disabled unless explicitly enabled", () => {
  assert.throws(
    () => getAdminExecutionConfig({ OPERATOR_CONSOLE_ADMIN_ENABLED: "false", OPERATOR_CONSOLE_ADMIN_TOKEN: token }),
    /disabled/,
  );
});

test("administrative execution requires a sufficiently long token", () => {
  assert.throws(
    () => getAdminExecutionConfig({ OPERATOR_CONSOLE_ADMIN_ENABLED: "true", OPERATOR_CONSOLE_ADMIN_TOKEN: "short" }),
    /at least 32/,
  );
});

test("bearer authorization uses exact token equality", () => {
  assert.equal(isAuthorizedAdminBearer(`Bearer ${token}`, token), true);
  assert.equal(isAuthorizedAdminBearer(`Bearer ${token}x`, token), false);
  assert.equal(isAuthorizedAdminBearer(null, token), false);
});
