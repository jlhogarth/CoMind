import Fastify from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { validatePrincipals, type Principal } from '../runbook/security.js';
import { sha256, type ReturnRecord } from './core.js';

const path = z.strictObject({ id: z.string().uuid() });
const receipt = z.strictObject({ resultDigest: z.string().regex(/^[0-9a-f]{64}$/) });
const hash = (value: string) => createHash('sha256').update(value).digest();

export type FallbackReader = {
  readFallback(returnId: string, ownerBinding: string): Promise<ReturnRecord>;
  acknowledgeFallback(returnId: string, ownerBinding: string, resultDigest: string): Promise<ReturnRecord>;
};

export function buildReturnFallbackService(input: {
  store: FallbackReader;
  loadPrincipals: () => Promise<Principal[]>;
  now?: () => number;
}) {
  const app = Fastify({ logger: false, bodyLimit: 2048, requestTimeout: 10_000, trustProxy: false });
  const now = input.now ?? Date.now;
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
  });
  async function authenticate(header: string | undefined): Promise<Principal | null> {
    if (!header?.startsWith('Bearer ') || header.length > 1024) return null;
    const supplied = hash(header.slice(7));
    const principals = validatePrincipals(await input.loadPrincipals());
    return principals.find(principal =>
      timingSafeEqual(hash(principal.token), supplied) && !principal.disabled &&
      Date.parse(principal.expiresAt) > now() && principal.projects.includes('COMIND')) ?? null;
  }
  app.get('/v1/aed/returns/:id', async (request, reply) => {
    let principal: Principal | null;
    try { principal = await authenticate(request.headers.authorization); }
    catch { return reply.code(503).send({ error: 'credentials_unavailable' }); }
    if (!principal) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = path.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_return_id' });
    try {
      const record = await input.store.readFallback(parsed.data.id, principal.id);
      if (sha256(record.envelope.resultText) !== record.envelope.resultDigest) {
        return reply.code(503).send({ error: 'integrity_failure' });
      }
      return { returnId: parsed.data.id, originId: record.envelope.origin.originId,
        state: record.state, resultText: record.envelope.resultText,
        resultDigest: record.envelope.resultDigest,
        resultArtifactRef: record.envelope.resultArtifactRef };
    } catch { return reply.code(404).send({ error: 'return_not_available' }); }
  });
  app.post('/v1/aed/returns/:id/receipt', async (request, reply) => {
    let principal: Principal | null;
    try { principal = await authenticate(request.headers.authorization); }
    catch { return reply.code(503).send({ error: 'credentials_unavailable' }); }
    if (!principal) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = path.safeParse(request.params);
    const body = receipt.safeParse(request.body);
    if (!parsed.success || !body.success) return reply.code(400).send({ error: 'invalid_receipt' });
    try {
      const record = await input.store.acknowledgeFallback(
        parsed.data.id, principal.id, body.data.resultDigest);
      return { returnId: parsed.data.id, state: record.state,
        receiptDigest: record.receiptDigest };
    } catch { return reply.code(404).send({ error: 'return_not_available' }); }
  });
  return app;
}
