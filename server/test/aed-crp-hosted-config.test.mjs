import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHostedTestConfig, AED_CRP_TEST_RAILWAY_PROJECT,
  AED_CRP_TEST_RAILWAY_ENVIRONMENT } from '../dist/return-protocol/hosted-test-host.js';

const valid = {
  AED_CRP_TEST_DATABASE_URL: 'postgresql://user:secret@postgres.railway.internal:5432/railway',
  AED_CRP_PRINCIPALS_JSON: JSON.stringify([{
    id: 'test-owner', token: 'a'.repeat(32), projects: ['COMIND'],
    expiresAt: '2030-01-01T00:00:00Z',
  }]),
  AED_CRP_TEST_ONLY: 'true', PORT: '3012',
  RAILWAY_PROJECT_ID: AED_CRP_TEST_RAILWAY_PROJECT,
  RAILWAY_ENVIRONMENT_ID: AED_CRP_TEST_RAILWAY_ENVIRONMENT,
};

test('accepts only the isolated private Railway Test binding', () => {
  assert.equal(parseHostedTestConfig(valid).port, 3012);
  for (const change of [
    { RAILWAY_PROJECT_ID: '0ddd5aa1-d1e5-4425-b6e8-448bc6d5b6ca' },
    { RAILWAY_ENVIRONMENT_ID: 'b10f2849-a859-48f1-9613-c731c38e2f33' },
    { AED_CRP_TEST_ONLY: 'false' },
    { AED_CRP_TEST_DATABASE_URL: 'postgres://user:secret@db.sbgfuanxiqepcoboxzcl.supabase.co/postgres' },
    { AED_CRP_TEST_DATABASE_URL: 'postgres://user:secret@postgres.railway.internal/postgres' },
    { AED_CRP_PRINCIPALS_JSON: '[]' },
  ]) {
    assert.throws(() => parseHostedTestConfig({ ...valid, ...change }));
  }
});
