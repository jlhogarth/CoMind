import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCbeControlExecutor, CbeControlUnavailableError } from '../dist/cbe-control/executor.js';

function request(action, overrides = {}) {
  return {
    action,
    work_key: null,
    recovery_id: null,
    environment: 'development-test',
    production_change: false,
    requested_at: '2026-11-02T00:00:00.000Z',
    ...overrides,
  };
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-mobile-002-'));
  let launchCount = 0;
  let closeCount = 0;
  let releaseCount = 0;
  const executor = createCbeControlExecutor({
    profileDir: root,
    launcher: async () => {
      launchCount += 1;
      return { close: async () => { closeCount += 1; } };
    },
    acquireProfileLock: async () => ({
      acquired: true,
      handle: { path: join(root, '.lock'), token: 'test', release: async () => { releaseCount += 1; } },
    }),
    ...options,
  });
  return {
    root,
    executor,
    counts: () => ({ launchCount, closeCount, releaseCount }),
    cleanup: async () => { await executor.close().catch(() => undefined); await rm(root, { recursive: true, force: true }); },
  };
}

test('browser lifecycle is idempotent and releases the profile lock', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.executor.execute(request('start_browser'))).status, 'started');
    assert.equal((await f.executor.execute(request('start_browser'))).status, 'already_running');
    assert.deepEqual(f.counts(), { launchCount: 1, closeCount: 0, releaseCount: 0 });
    assert.equal((await f.executor.execute(request('stop_browser'))).status, 'stopped');
    assert.equal((await f.executor.execute(request('stop_browser'))).status, 'already_stopped');
    assert.deepEqual(f.counts(), { launchCount: 1, closeCount: 1, releaseCount: 1 });
  } finally { await f.cleanup(); }
});

test('profile lock contention fails closed before browser launch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-mobile-002-lock-'));
  let launched = false;
  const executor = createCbeControlExecutor({
    profileDir: root,
    launcher: async () => { launched = true; return { close: async () => {} }; },
    acquireProfileLock: async () => ({ acquired: false }),
  });
  try {
    await assert.rejects(() => executor.execute(request('start_browser')), (error) => {
      assert.ok(error instanceof CbeControlUnavailableError);
      assert.equal(error.reason, 'profile_locked');
      return true;
    });
    assert.equal(launched, false);
  } finally { await executor.close(); await rm(root, { recursive: true, force: true }); }
});

test('conversation wake is unavailable until the canonical recovery resolver is bound', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      () => f.executor.execute(request('wake_conversation', { work_key: 'NOTEBOOK-001' })),
      (error) => {
        assert.ok(error instanceof CbeControlUnavailableError);
        assert.equal(error.reason, 'recovery_resolver_unavailable');
        return true;
      }
    );
  } finally { await f.cleanup(); }
});

test('human authentication returns only a configured HTTPS surface', async () => {
  const f = await fixture({ humanAuthUrl: 'https://auth.example.test/session' });
  try {
    const response = await f.executor.execute(request('open_auth'));
    assert.equal(response.status, 'human_action_required');
    assert.equal(response.human_action_required, true);
    assert.equal(response.human_action_url, 'https://auth.example.test/session');
  } finally { await f.cleanup(); }
});
