import { fingerprintCanonicalValue } from '../continuity/checkpoint.js';
import {
  THREADKEEPER_SCOPE_TYPES,
  type ResolvedScopeBinding,
  type ScopeBinding,
} from './types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactBoundedString(value: unknown, field: string, max: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

export function validateScopeBinding(binding: ScopeBinding): void {
  if (!binding || typeof binding !== 'object') throw new Error('Invalid continuity scope binding');
  if (!THREADKEEPER_SCOPE_TYPES.includes(binding.scopeType)) throw new Error('Invalid continuity scope type');
  exactBoundedString(binding.namespace, 'continuity scope namespace', 256);
  exactBoundedString(binding.subjectRef, 'continuity scope subject reference', 2048);
  if (binding.scopeId !== undefined && !UUID_PATTERN.test(binding.scopeId)) {
    throw new Error('Invalid continuity scope id');
  }
}

export function semanticScopeKey(binding: ScopeBinding): string {
  validateScopeBinding(binding);
  const digest = fingerprintCanonicalValue({
    namespace: binding.namespace,
    scopeType: binding.scopeType,
    subjectRef: binding.subjectRef,
  });
  return `tk-scope:${digest}`;
}

export function resolveScopeBinding(
  binding: ScopeBinding,
  candidateScopeIds: string[] = []
): ResolvedScopeBinding {
  validateScopeBinding(binding);
  const uniqueCandidates = [...new Set(candidateScopeIds)];
  if (uniqueCandidates.some(candidate => !UUID_PATTERN.test(candidate))) {
    throw new Error('Invalid candidate continuity scope id');
  }
  if (uniqueCandidates.length > 1) throw new Error('Ambiguous continuity scope identity');
  if (binding.scopeId && uniqueCandidates.length === 1 && binding.scopeId !== uniqueCandidates[0]) {
    throw new Error('Continuity scope identity mismatch');
  }

  return {
    scopeId: binding.scopeId ?? uniqueCandidates[0] ?? null,
    scopeType: binding.scopeType,
    namespace: binding.namespace,
    subjectRef: binding.subjectRef,
    semanticKey: semanticScopeKey(binding),
  };
}
