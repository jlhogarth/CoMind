import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acquirePublicMetadata, authorizePublicDispatch, PUBLIC_QUESTION } from '../src/research-department/public-acquisition.mjs';

const request = { classification: 'public', question: PUBLIC_QUESTION };
const provider = { id: 'crossref', endpoint: 'https://api.crossref.org/works', mode: 'FREE_ONLY',
  revoked: false, suspended: false, incrementalCostUsd: 0, paidFallback: false,
  freeEntitlementVerified: true, termsEvidenceUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  entitlementEvidenceUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/',
  reviewDueAt: '2026-12-01T00:00:00Z' };
const now = new Date('2026-11-28T00:00:00Z');

test('dispatch rejects private context, attachments, destinations and stale or paid entitlement before network', async () => {
  const denied = [
    [{ ...request, question: 'CoMind private memory algorithm' }, provider, 'DISCLOSURE_DENIED'],
    [{ ...request, classification: 'proprietary' }, provider, 'DISCLOSURE_DENIED'],
    [{ ...request, attachments: ['secret'] }, provider, 'DISCLOSURE_DENIED'],
    [{ ...request, metadata: { internal: true } }, provider, 'DISCLOSURE_DENIED'],
    [request, { ...provider, endpoint: 'https://api.crossref.org/not-works' }, 'PROVIDER_UNAUTHORIZED'],
    [request, { ...provider, incrementalCostUsd: null }, 'COST_UNVERIFIED'],
    [request, { ...provider, paidFallback: true }, 'COST_UNVERIFIED'],
    [request, { ...provider, reviewDueAt: '2026-11-01T00:00:00Z' }, 'ENTITLEMENT_STALE'],
    [request, { ...provider, suspended: true }, 'PROVIDER_UNAUTHORIZED'],
  ];
  let dispatched = 0;
  for (const [input, profile, code] of denied) {
    await assert.rejects(acquirePublicMetadata({ request: input, provider: profile, now,
      fetchFn: async () => { dispatched++; }, queryFn: async () => ({ rows: [] }) }),
    { code });
  }
  assert.equal(dispatched, 0);
});

test('public metadata enters canonical reference once, with independent readback and replay', async () => {
  const rows = [];
  const sql = async (statement, params) => {
    if (statement.startsWith('INSERT')) {
      const row = { ref_id: 'f23b70cb-4b58-45d1-8848-997438dd4425', title: params[0], document_identifier: params[2] };
      rows.push(row);
      assert.equal(JSON.parse(params[7]).rights, 'unknown_metadata_only');
      assert.equal(JSON.parse(params[7]).provider_reference, 'https://api.crossref.org/works/10.1000%2Ftest');
      return { rows: [row] };
    }
    if (statement.includes('WHERE ref_id=')) return { rows: rows.filter(r => r.ref_id === params[0]) };
    return { rows: rows.filter(r => r.document_identifier === params[0]) };
  };
  const fetchFn = async url => {
    assert.equal(url.hostname, 'api.crossref.org');
    assert.equal(url.searchParams.get('query'), PUBLIC_QUESTION);
    return { ok: true, json: async () => ({ message: { items: [{ DOI: '10.1000/test', title: ['Public title'], publisher: 'Publisher', URL: 'https://api.crossref.org/other' }] } }) };
  };
  const first = await acquirePublicMetadata({ request, provider, fetchFn, queryFn: sql, now });
  const second = await acquirePublicMetadata({ request, provider, fetchFn, queryFn: sql, now });
  assert.equal(first.readbackVerified, true);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(rows.length, 1);
  assert.equal(first.evidenceId, second.evidenceId);
});

test('invalid provider response and failed readback do not report ingestion', async () => {
  const sql = async statement => statement.includes('RETURNING') ? { rows: [{ ref_id: 'id' }] } : { rows: [] };
  await assert.rejects(acquirePublicMetadata({ request, provider, now, queryFn: sql,
    fetchFn: async () => ({ ok: true, json: async () => ({ message: { items: [{ title: ['No DOI'] }] } }) }) }),
  { code: 'INVALID_PROVIDER_METADATA' });
  await assert.rejects(acquirePublicMetadata({ request, provider, now, queryFn: sql,
    fetchFn: async () => ({ ok: true, json: async () => ({ message: { items: [{ DOI: '10.1000/test', title: ['Public title'] }] } }) }) }),
  { code: 'READBACK_MISMATCH' });
});

test('valid dispatch URL carries only approved public question', () => {
  const url = authorizePublicDispatch(request, provider, now);
  assert.equal(url.searchParams.get('query'), PUBLIC_QUESTION);
  assert.equal([...url.searchParams.keys()].join(','), 'query,rows');
});
