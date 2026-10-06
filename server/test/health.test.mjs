import assert from 'node:assert/strict';
import test from 'node:test';

test('root health endpoint responds successfully', async () => {
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';
  const { buildApp } = await import('../dist/app.js');
  const app = await buildApp();

  try {
    const response = await app.inject({ method: 'GET', url: '/' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true });
  } finally {
    await app.close();
  }
});
