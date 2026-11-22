import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');

const devcontainer = JSON.parse(await readFile(resolve(root, '.devcontainer/devcontainer.json'), 'utf8'));
const dockerfile = await readFile(resolve(root, '.devcontainer/Dockerfile'), 'utf8');
const wrapper = await readFile(resolve(root, 'scripts/cbe_chatgpt_codespace_auth.sh'), 'utf8');
const session = await readFile(resolve(root, 'server/scripts/cbe-chatgpt-codespace-auth.mjs'), 'utf8');

assert.ok(devcontainer.forwardPorts?.includes(6080), 'private CBE browser port 6080 must be forwarded');
assert.equal(devcontainer.portsAttributes?.['6080']?.label, 'CBE interactive browser');

for (const dependency of ['xvfb', 'x11vnc', 'novnc', 'websockify', 'openbox']) {
  assert.ok(dockerfile.includes(dependency), `devcontainer must install ${dependency}`);
}

assert.ok(wrapper.includes('CBE_PROFILE_DIR:-/workspaces/.comind-chatgpt-profile'));
assert.ok(wrapper.includes('-localhost'), 'VNC listener must remain localhost-only');
assert.ok(wrapper.includes('127.0.0.1:${novnc_port}'), 'noVNC listener must remain loopback-bound');
assert.ok(wrapper.includes('node scripts/cbe-chatgpt-codespace-auth.mjs'));
assert.ok(wrapper.includes('visibility Private'));

assert.ok(session.includes("page.goto('https://chatgpt.com/'"));
assert.ok(session.includes('verifyChatgptAuthentication'));
assert.ok(session.includes('acquireChatgptProfileLock'));
assert.ok(session.includes('headless: false'));
assert.ok(session.includes("throw new Error('profile_actuator_busy')"));
assert.ok(session.includes('authenticationMaterialRecorded: false'));
assert.ok(session.includes('liveReturnVerified: false'));

console.log('CBE-AUTH-002 Codespaces ChatGPT contract verified.');
