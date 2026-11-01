import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapProfile, verifyChatgptAuthentication } from '../scripts/cbe-chatgpt-auth-check.mjs';

function fixture({ composer = true, profile = true, login = false, navigationFails = false, url = 'https://chatgpt.com/' } = {}) {
  let closed = 0;
  const visible = value => ({ first() { return this; }, async isVisible() { return value; } });
  const page = {
    url: () => url,
    locator: () => visible(composer),
    getByTestId: () => visible(profile),
    getByRole: () => visible(login),
    async goto() { if (navigationFails) throw new Error('navigation failed'); },
  };
  const context = { pages: () => [page], async close() { closed++; } };
  return { page, chromium: { async launchPersistentContext() { return context; } }, closed: () => closed };
}

test('anonymous composer is not accepted as authentication', async () => {
  assert.equal(await verifyChatgptAuthentication(fixture({ profile: false }).page), false);
});
test('visible login control rejects ambiguous UI', async () => {
  assert.equal(await verifyChatgptAuthentication(fixture({ login: true }).page), false);
});
test('wrong origin is rejected', async () => {
  assert.equal(await verifyChatgptAuthentication(fixture({ url: 'https://example.com/' }).page), false);
});
test('signed-in account control and composer are both required', async () => {
  assert.equal(await verifyChatgptAuthentication(fixture().page), true);
  assert.equal(await verifyChatgptAuthentication(fixture({ composer: false }).page), false);
});
test('navigation failure closes the persistent context', async () => {
  const f = fixture({ navigationFails: true });
  await assert.rejects(bootstrapProfile({ ...f, confirm: async () => {}, report() { assert.fail('no success'); } }), /navigation failed/);
  assert.equal(f.closed(), 1);
});
test('failed authentication closes context without reporting success', async () => {
  const f = fixture({ profile: false });
  await assert.rejects(bootstrapProfile({ ...f, confirm: async () => {}, report() { assert.fail('no success'); } }), /Sign-in could not be verified/);
  assert.equal(f.closed(), 1);
});
test('confirmed signed-in UI reports once and closes context', async () => {
  const f = fixture();
  let reports = 0;
  await bootstrapProfile({ ...f, confirm: async () => {}, report() { reports++; } });
  assert.equal(reports, 1);
  assert.equal(f.closed(), 1);
});
