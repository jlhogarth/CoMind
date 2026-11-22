import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('CBE-AED-006 instrumentation is metadata-only and does not invoke inference', () => {
  const worker = readFileSync(new URL('../src/browser-executor/worker.ts', import.meta.url), 'utf8');
  assert.match(worker, /contextStartupMs/);
  assert.match(worker, /navigationMs/);
  assert.match(worker, /titleBytes: Buffer.byteLength/);
  assert.match(worker, /modelRequests: 0/);
  assert.match(worker, /await driver.close\(\)/);
});
