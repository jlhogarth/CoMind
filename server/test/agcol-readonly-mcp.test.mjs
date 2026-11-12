import assert from 'node:assert/strict';
import test from 'node:test';

const { callIsolatedReadOnlyMcp, createReadOnlyMcpAdapter } = await import('../dist/agcol-readonly-mcp.js');
const request = {
  executionContextId: 'execution-1', adapterOperationId: 'operation-1',
  capabilityCode: 'read_evidence', action: 'read', authorityLevel: 'C1',
  targetKind: 'evidence_resource', targetRef: 'fixture:one',
  requestFingerprint: 'fingerprint-1', input: { synthetic: true },
};
test('actual local MCP initialize, list and call yields one typed read-only resource', async () => {
  const result = await callIsolatedReadOnlyMcp('fixture:one');
  assert.equal(result.content.length, 1);
  const record = JSON.parse(result.content[0].text);
  assert.equal(record.resource, 'fixture:one');
  assert.equal(record.source, 'isolated_fixture');
});
test('adapter records a bounded provenance receipt and returns its durable reference', async () => {
  const receipts = [];
  const adapter = createReadOnlyMcpAdapter(
    { callTool: (_name, args) => callIsolatedReadOnlyMcp(args.resource) },
    async receipt => { receipts.push(receipt); return 'evidence-receipt-1'; },
  );
  const result = await adapter(request);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.resultRef, 'evidence-receipt-1');
  assert.equal(receipts[0].resource, 'fixture:one');
  assert.equal(receipts[0].toolName, 'lookup_evidence');
  assert.equal(receipts[0].costUsd, 0);
  assert.match(receipts[0].resultFingerprint, /^[a-f0-9]{64}$/);
});
test('foreign tool output, scope expansion and receipt failure fail closed', async () => {
  const bad = { callTool: async () => ({ content: [{ type: 'text', text: JSON.stringify({
    kind: 'evidence', resource: 'another:resource', source: 'isolated_fixture', digest: 'a'.repeat(64),
  }) }] }) };
  const adapter = createReadOnlyMcpAdapter(bad, async () => 'receipt');
  await assert.rejects(adapter(request), { code: 'mcp_output' });
  await assert.rejects(adapter({ ...request, action: 'write' }), { code: 'mcp_scope' });
  await assert.rejects(adapter({ ...request, input: { synthetic: true, command: 'override' } }), { code: 'mcp_scope' });
  const good = { callTool: (_name, args) => callIsolatedReadOnlyMcp(args.resource) };
  await assert.rejects(createReadOnlyMcpAdapter(good, async () => '')(request), { code: 'mcp_receipt' });
});
