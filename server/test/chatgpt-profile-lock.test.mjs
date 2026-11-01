import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireChatgptProfileLock } from '../dist/browser-executor/chatgpt-profile-lock.js';

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

test('fails closed on an existing same-host lock instead of stealing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'comind-cbe-existing-lock-'));
  const profileDir = join(root, 'profile');
  try {
    const first = await acquireChatgptProfileLock(profileDir, {
      host: 'cbe-test-host',
      pid: 424242,
    });
    assert.equal(first.acquired, true);

    const second = await acquireChatgptProfileLock(profileDir, {
      host: 'cbe-test-host',
      pid: 515151,
    });
    assert.deepEqual(second, { acquired: false, reason: 'profile_actuator_busy' });

    if (first.acquired) await first.handle.release();
  } finally {
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
    });
    assert.equal(first.acquired, true);

    const second = await acquireChatgptProfileLock(profileDir, {
      host: 'host-b',
      pid: 414141,
    });
    assert.deepEqual(second, { acquired: false, reason: 'profile_actuator_busy' });

    if (first.acquired) await first.handle.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
