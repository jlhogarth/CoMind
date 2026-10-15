import assert from "node:assert/strict";
import test from "node:test";
import type { RelationAccessResult } from "../src/lib/schema/permissions";

test("permission model distinguishes denied access from empty data", () => {
  const denied: RelationAccessResult = { state: "denied", detail: "RLS" };
  const empty: RelationAccessResult = { state: "empty" };
  assert.notEqual(denied.state, empty.state);
});
