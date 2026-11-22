import type { QueryFunction } from '../db.js';
import { createFoundryBrowserLeaseVerifier } from '../browser-executor/lease.js';
import type { DispatchAuthority, RegisteredOrigin } from './core.js';
import type { PostgresReturnStore } from './postgres.js';
import { clearForShock, type ClearSafety } from '../../lib/aed-liveness.js';
import { returnSchema, type ReturnEnvelope, type ReturnRecord } from './core.js';

/**
 * Reuses the canonical Foundry lease verifier. A deployment must bind CLEAR to
 * its existing governed authorization resolver. No permissive default exists.
 */
export function createFoundryReturnAuthority(input: {
  store: Pick<PostgresReturnStore, 'resolveOrigin'>;
  query: QueryFunction;
  verifyClear: (authorizationRef: string) => Promise<boolean>;
  now?: () => Date;
}): DispatchAuthority {
  const verify = createFoundryBrowserLeaseVerifier(input.query);
  return {
    resolveOrigin: (originId: string): Promise<RegisteredOrigin | null> =>
      input.store.resolveOrigin(originId),
    async verifyLease(lease) {
      const result = await verify(lease, (input.now ?? (() => new Date()))().toISOString());
      return result.valid;
    },
    verifyClear: input.verifyClear,
  };
}

/** The caller must resolve current trusted facts for this exact authority reference. */
export function createClearReturnVerifier(
  resolveSafety: (authorizationRef: string) => Promise<ClearSafety | null>
): (authorizationRef: string) => Promise<boolean> {
  return async authorizationRef => {
    const safety = await resolveSafety(authorizationRef);
    return safety !== null && clearForShock(safety).clear;
  };
}

/** Persist a fallback only after the same live authority checks used by dispatch. */
export async function stageGovernedFallback(input: {
  envelope: ReturnEnvelope;
  store: Pick<PostgresReturnStore, 'resolveOrigin' | 'stage'>;
  authority: DispatchAuthority;
  authenticatedOwnerBinding: string;
  now?: () => Date;
}): Promise<ReturnRecord> {
  const envelope = returnSchema.parse(input.envelope);
  if (envelope.adapter !== 'comind_fallback') throw new Error('fallback_adapter_required');
  if (envelope.origin.ownerBinding !== input.authenticatedOwnerBinding) throw new Error('owner_binding_mismatch');
  if ((input.now ?? (() => new Date()))().getTime() >= Date.parse(envelope.expiresAt)) {
    throw new Error('return_expired');
  }
  const registered = await input.authority.resolveOrigin(envelope.origin.originId);
  if (!registered || Object.entries(envelope.origin).some(([key, value]) =>
    registered[key as keyof typeof registered] !== value)) throw new Error('origin_binding_changed');
  if (!await input.authority.verifyLease(envelope.lease)) throw new Error('lease_invalid');
  if (!await input.authority.verifyClear(envelope.authorizationRef)) throw new Error('clear_invalid');
  return input.store.stage(envelope);
}
