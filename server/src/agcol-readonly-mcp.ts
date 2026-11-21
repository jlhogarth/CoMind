import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256Fingerprint } from './foundry-runtime.js';
import type { FoundryAdapter, FoundryAdapterRequest } from './foundry-runtime.js';

const SERVER = fileURLToPath(new URL('../test/support/agcol-readonly-mcp-server.mjs', import.meta.url));
const TOOL = 'lookup_evidence';
const PROTOCOL = '2025-06-18';
const REF = /^[a-zA-Z0-9._:-]{1,128}$/;
interface RpcMessage { readonly jsonrpc: string; readonly id?: number; readonly result?: unknown; readonly error?: unknown }
interface McpTransport {
  callTool(name: string, args: { readonly resource: string }): Promise<unknown>;
}
export interface McpReceipt {
  readonly adapterOperationId: string;
  readonly executionContextId: string;
  readonly requestFingerprint: string;
  readonly toolName: string;
  readonly resource: string;
  readonly resultFingerprint: string;
  readonly status: 'succeeded';
  readonly latencyMs: number;
  readonly costUsd: 0;
  readonly source: string;
}
export class McpBoundaryError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'McpBoundaryError'; }
}
// A fixed, local fixture server proves the MCP wire protocol without a model, network, or credentials.
export async function callIsolatedReadOnlyMcp(resource: string, timeoutMs = 5000): Promise<unknown> {
  if (!REF.test(resource) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    throw new McpBoundaryError('invalid_resource', 'Bounded resource and timeout are required');
  const child = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH ?? '' },
  });
  let buffer = '';
  let nextId = 0;
  const awaiting = new Map<number, { resolve: (result: unknown) => void; reject: (reason: Error) => void }>();
  const failAll = (error: Error) => {
    for (const waiter of awaiting.values()) waiter.reject(error);
    awaiting.clear();
  };
  const timer = setTimeout(() => {
    failAll(new McpBoundaryError('mcp_timeout', 'MCP server exceeded bounded deadline'));
    child.kill();
  }, timeoutMs);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > 65536) {
      failAll(new McpBoundaryError('mcp_oversize', 'MCP response exceeds size limit'));
      child.kill();
      return;
    }
    for (let newline = buffer.indexOf('\n'); newline !== -1; newline = buffer.indexOf('\n')) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try {
        const response = JSON.parse(line) as RpcMessage;
        if (response.jsonrpc !== '2.0' || typeof response.id !== 'number') throw new Error('Invalid JSON-RPC');
        const waiter = awaiting.get(response.id);
        if (!waiter) throw new Error('Unexpected JSON-RPC ID');
        awaiting.delete(response.id);
        if (response.error) waiter.reject(new McpBoundaryError('mcp_error', 'MCP server rejected the call'));
        else waiter.resolve(response.result);
      } catch {
        failAll(new McpBoundaryError('mcp_protocol', 'Invalid or unsolicited MCP response'));
        child.kill();
      }
    }
  });
  child.on('error', () => failAll(new McpBoundaryError('mcp_spawn', 'MCP process failed')));
  child.on('exit', code => { if (code !== 0) failAll(new McpBoundaryError('mcp_exit', 'MCP process exited before completion')); });
  function send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      awaiting.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} }) + '\n');
    });
  }
  try {
    const hello = await send('initialize', {
      protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'comind-agcol-test', version: '1.0.0' },
    }) as { protocolVersion?: string };
    if (hello?.protocolVersion !== PROTOCOL) throw new McpBoundaryError('mcp_version', 'Protocol mismatch');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await send('tools/list') as { tools?: { name?: string }[] };
    if (!Array.isArray(listed?.tools) || listed.tools.length !== 1 || listed.tools[0]?.name !== TOOL)
      throw new McpBoundaryError('mcp_allowlist', 'MCP server tool list changed');
    return await send('tools/call', { name: TOOL, arguments: { resource } });
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

export function createReadOnlyMcpAdapter(
  transport: McpTransport,
  persistReceipt: (receipt: McpReceipt) => Promise<string>,
  now: () => number = Date.now
): FoundryAdapter {
  return async (request: FoundryAdapterRequest) => {
    if (request.action !== 'read' || request.authorityLevel !== 'C1'
      || request.targetKind !== 'evidence_resource' || !request.targetRef
      || !REF.test(request.targetRef) || request.input.synthetic !== true
      || Object.keys(request.input).some(key => !['synthetic', 'predecessor_evidence'].includes(key))
      || (request.input.predecessor_evidence !== undefined
        && (!Array.isArray(request.input.predecessor_evidence)
          || request.input.predecessor_evidence.length > 8
          || request.input.predecessor_evidence.some(ref => typeof ref !== 'string' || !REF.test(ref))))) {
      throw new McpBoundaryError('mcp_scope', 'Read-only MCP adapter rejected untrusted input or authority');
    }
    const resource = request.targetRef;
    const start = now();
    const raw = await transport.callTool(TOOL, { resource });
    // Accept only a bounded typed result. Tool text never enters another agent's instruction channel.
    const envelope = raw as { isError?: unknown; content?: unknown };
    if (envelope?.isError || !Array.isArray(envelope?.content) || envelope.content.length !== 1)
      throw new McpBoundaryError('mcp_output', 'MCP tool returned an error or unexpected content');
    const item = envelope.content[0] as { type?: unknown; text?: unknown };
    if (item?.type !== 'text' || typeof item.text !== 'string' || item.text.length > 2048)
      throw new McpBoundaryError('mcp_output', 'MCP content must be bounded text JSON');
    let parsed: unknown;
    try { parsed = JSON.parse(item.text); } catch { throw new McpBoundaryError('mcp_output', 'MCP content is not JSON'); }
    const record = parsed as Record<string, unknown>;
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || Object.keys(record).sort().join(',') !== 'digest,kind,resource,source'
      || record.kind !== 'evidence' || record.resource !== resource
      || record.source !== 'isolated_fixture' || typeof record.digest !== 'string'
      || !/^[a-f0-9]{64}$/.test(record.digest)) {
      throw new McpBoundaryError('mcp_output', 'MCP output failed strict resource and provenance schema');
    }
    const receipt: McpReceipt = Object.freeze({
      adapterOperationId: request.adapterOperationId, executionContextId: request.executionContextId,
      requestFingerprint: request.requestFingerprint, toolName: TOOL, resource,
      resultFingerprint: sha256Fingerprint(record), status: 'succeeded',
      latencyMs: Math.max(0, now() - start), costUsd: 0, source: 'isolated_fixture',
    });
    const evidenceRef = await persistReceipt(receipt);
    if (!evidenceRef) throw new McpBoundaryError('mcp_receipt', 'Canonical receipt persistence failed');
    return { status: 'succeeded', resultRef: evidenceRef, summary: 'Allowlisted read-only MCP evidence lookup completed' };
  };
}
