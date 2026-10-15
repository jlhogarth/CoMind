import assert from "node:assert/strict";
import test from "node:test";

import { readRelationPage } from "../src/lib/queries/read";

test("rejects unsafe relation identifiers before issuing a query", async () => {
  const unusedClient = {} as never;
  await assert.rejects(
    readRelationPage(unusedClient, { relation: "messages; drop table messages" }),
    /Invalid relation name/,
  );
});
