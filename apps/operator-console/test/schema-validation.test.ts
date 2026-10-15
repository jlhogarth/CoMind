import assert from "node:assert/strict";
import test from "node:test";

import { validateSchemaMetadata } from "../src/lib/schema/validate";

test("rejects incomplete metadata at the provider trust boundary", () => {
  assert.throws(() => validateSchemaMetadata({ relations: [], foreignKeys: [{ onDelete: "CASCADE" }] }));
});

test("accepts an empty but structurally valid schema result", () => {
  assert.deepEqual(validateSchemaMetadata({ relations: [], foreignKeys: [] }), { relations: [], foreignKeys: [] });
});
