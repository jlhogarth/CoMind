import assert from "node:assert/strict";
import { test } from "node:test";

import {
  integrationGatewayProcess,
  integrationGatewaySnapshot,
  isPublicIntegrationGatewaySnapshotSafe,
  l4aMandatoryStops,
  type IntegrationGatewaySnapshot,
} from "../src/lib/integration-gateway/model";

test("CIG public snapshot is non-production and contains no raw credential fields", () => {
  assert.equal(integrationGatewaySnapshot.production_authority, false);
  assert.equal(isPublicIntegrationGatewaySnapshotSafe(integrationGatewaySnapshot), true);
  assert.deepEqual(integrationGatewaySnapshot.connections.map((connection) => connection.toolkit), ["GitHub", "Supabase"]);
});

test("CIG public snapshot rejects accidental OAuth token material", () => {
  const unsafe = {
    ...integrationGatewaySnapshot,
    access_token: "must-not-be-present",
  } as IntegrationGatewaySnapshot;
  assert.equal(isPublicIntegrationGatewaySnapshotSafe(unsafe), false);
});

test("CIG process requires authority freshness, RuleBook controls, verification, and evidence", () => {
  const process = integrationGatewayProcess.join(" ").toLowerCase();
  assert.match(process, /canonical development environment contract/);
  assert.match(process, /durable l4a authority/);
  assert.match(process, /rulebook/);
  assert.match(process, /verify provider state/);
  assert.match(process, /evidence/);
  assert.ok(l4aMandatoryStops.includes("Platform-enforced human confirmation"));
});
