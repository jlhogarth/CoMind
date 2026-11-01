import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireChatgptProfileLock,
  chatgptProfileLockPath,
} from '../dist/browser-executor/chatgpt-profile-lock.js';

test('serializes access to one persistent ChatGPT browser profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-lock-'));
  const profileDir = join(root, 'profile');
  try {
    const first = await acquireChatgptProfileLock(profileDir);
    assert.equal(first.acquired, true);
    if (!first.acquired) return;

    const second = await acquireChatgptProfileLock(profileDir);
    assert.deepEqual(second, { acquired: false, reason: 'profile_actuator_busy' });

    const owner = JSON.parse(await readFile(`${first.handle.lockPath}/owner.json`, 'utf8'));
    assert.equal(owner.pid, process.pid);
    assert.equal(typeof owner.token, 'string');
    assert.equal(owner.token.length > 0, true);

    await first.handle.release();

    const third = await acquireChatgptProfileLock(profileDir);
    assert.equal(third.acquired, true);
    if (third.acquired) await third.handle.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reclaims a same-host lock only when its owning process is no longer alive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-stale-lock-'));
  const profileDir = join(root, 'profile');
  const host = 'cbe-test-host';
  try {
    const first = await acquireChatgptProfileLock(profileDir, {
      host,
      pid: 424242,
      isProcessAlive: () => true,
    });
    assert.equal(first.acquired, true);

    const recovered = await acquireChatgptProfileLock(profileDir, {
      host,
      pid: 515151,
      isProcessAlive: pid => pid !== 424242,
    });
    assert.equal(recovered.acquired, true);
    if (recovered.acquired) await recovered.handle.release();
  } finally {
    await rm(chatgptProfileLockPath(profileDir), { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('fails closed when an existing lock belongs to another host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-remote-lock-'));
  const profileDir = join(root, 'profile');
  try {
    const first = await acquireChatgptProfileLock(profileDir, {
      host: 'host-a',
      pid: 313131,
      isProcessAlive: () => true,
    });
    assert.equal(first.acquired, true);

    const second = await acquireChatgptProfileLock(profileDir, {
      host: 'host-b',
      pid: 414141,
      isProcessAlive: () => false,
    });
    assert.deepEqual(second, { acquired: false, reason: 'profile_actuator_busy' });

    if (first.acquired) await first.handle.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
