import assert from "node:assert/strict";
import test from "node:test";
import { SchemaContractError } from "../src/lib/schema/errors";

test("schema contract errors preserve explicit identity", () => {
  assert.equal(new SchemaContractError("bad metadata").name, "SchemaContractError");
});
