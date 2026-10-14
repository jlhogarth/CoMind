import assert from "node:assert/strict";
import test from "node:test";

import {
  MetadataProviderUnavailableError,
  requireSchemaMetadataProvider,
} from "../src/lib/schema/provider";

test("fails closed when protected metadata introspection is not configured", () => {
  assert.throws(
    () => requireSchemaMetadataProvider(undefined),
    MetadataProviderUnavailableError,
  );
});
