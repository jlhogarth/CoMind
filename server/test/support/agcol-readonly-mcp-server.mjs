import { createHash } from 'node:crypto';
import readline from 'node:readline';

const TOOL = 'lookup_evidence';
const version = '2025-06-18';
let initialized = false;
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  try {
    const request = JSON.parse(line);
    if (request.method === 'notifications/initialized') { initialized = true; continue; }
    if (request.jsonrpc !== '2.0' || typeof request.id !== 'number') continue;
    let result;
    if (request.method === 'initialize' && request.params?.protocolVersion === version) {
      result = { protocolVersion: version, capabilities: { tools: {} }, serverInfo: { name: 'comind-isolated-evidence', version: '1.0.0' } };
    } else if (initialized && request.method === 'tools/list') {
      result = { tools: [{ name: TOOL, description: 'Read one synthetic evidence resource', inputSchema: {
        type: 'object', properties: { resource: { type: 'string' } }, required: ['resource'], additionalProperties: false,
      } }] };
    } else if (initialized && request.method === 'tools/call'
      && request.params?.name === TOOL
      && typeof request.params.arguments?.resource === 'string'
      && /^[a-zA-Z0-9._:-]{1,128}$/.test(request.params.arguments.resource)
      && Object.keys(request.params.arguments).length === 1) {
      const resource = request.params.arguments.resource;
      const digest = createHash('sha256').update(resource).digest('hex');
      result = { content: [{ type: 'text', text: JSON.stringify({
        kind: 'evidence', resource, source: 'isolated_fixture', digest,
      }) }] };
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id,
        error: { code: -32601, message: 'Unknown or unauthorized method' } }) + '\n');
      continue;
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  } catch {
    // Invalid input does not reveal internal state or credentials.
  }
}
