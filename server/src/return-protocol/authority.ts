import type { QueryFunction } from '../db.js';
import { createFoundryBrowserLeaseVerifier } from '../browser-executor/lease.js';
import type { DispatchAuthority, RegisteredOrigin } from './core.js';
import type { PostgresReturnStore } from './postgres.js';

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
