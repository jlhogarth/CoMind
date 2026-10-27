import type { ContinuityClassification, RouteCode } from './types.js';

export type ObservationDisposition = 'accepted' | 'duplicate' | 'rejected' | 'quarantined';
export type CheckpointAcceptanceOutcome =
  | 'accepted'
  | 'stale_head'
  | 'authority_failure'
  | 'integrity_failure';
export type ThreadKeeperLatencyOperation =
  | 'observation_validation'
  | 'assessment'
  | 'context_retrieval'
  | 'checkpoint_proposal'
  | 'checkpoint_acceptance';

export interface ThreadKeeperObservability {
  observation(disposition: ObservationDisposition): void;
  assessment(classification: ContinuityClassification, missingEvidence: boolean): void;
  scopeIdentityCollision(): void;
  caseOpened(): void;
  caseUnresolved(): void;
  caseBlocked(): void;
  route(routeCode: RouteCode): void;
  repeatedRouteCycle(): void;
  checkpointProposal(): void;
  checkpointAcceptance(outcome: CheckpointAcceptanceOutcome): void;
  evidenceResolverFailure(): void;
  latency(operation: ThreadKeeperLatencyOperation, milliseconds: number): void;
}

export class NoopThreadKeeperObservability implements ThreadKeeperObservability {
  observation(_disposition: ObservationDisposition): void {}
  assessment(_classification: ContinuityClassification, _missingEvidence: boolean): void {}
  scopeIdentityCollision(): void {}
  caseOpened(): void {}
  caseUnresolved(): void {}
  caseBlocked(): void {}
  route(_routeCode: RouteCode): void {}
  repeatedRouteCycle(): void {}
  checkpointProposal(): void {}
  checkpointAcceptance(_outcome: CheckpointAcceptanceOutcome): void {}
  evidenceResolverFailure(): void {}
  latency(_operation: ThreadKeeperLatencyOperation, _milliseconds: number): void {}
}

export interface ThreadKeeperMetricSnapshot {
  observations: Record<ObservationDisposition, number>;
  assessments: Partial<Record<ContinuityClassification, number>>;
  assessmentsMissingEvidence: number;
  scopeIdentityCollisions: number;
  casesOpened: number;
  casesUnresolved: number;
  casesBlocked: number;
  routes: Partial<Record<RouteCode, number>>;
  repeatedRouteCycles: number;
  checkpointProposals: number;
  checkpointAcceptances: Record<CheckpointAcceptanceOutcome, number>;
  evidenceResolverFailures: number;
  latencies: Partial<Record<ThreadKeeperLatencyOperation, number[]>>;
}

function finiteNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid ThreadKeeper latency measurement');
  return value;
}

export class InMemoryThreadKeeperObservability implements ThreadKeeperObservability {
  #snapshot: ThreadKeeperMetricSnapshot = {
    observations: { accepted: 0, duplicate: 0, rejected: 0, quarantined: 0 },
    assessments: {},
    assessmentsMissingEvidence: 0,
    scopeIdentityCollisions: 0,
    casesOpened: 0,
    casesUnresolved: 0,
    casesBlocked: 0,
    routes: {},
    repeatedRouteCycles: 0,
    checkpointProposals: 0,
    checkpointAcceptances: {
      accepted: 0,
      stale_head: 0,
      authority_failure: 0,
      integrity_failure: 0,
    },
    evidenceResolverFailures: 0,
    latencies: {},
  };

  observation(disposition: ObservationDisposition): void {
    this.#snapshot.observations[disposition] += 1;
  }

  assessment(classification: ContinuityClassification, missingEvidence: boolean): void {
    this.#snapshot.assessments[classification] = (this.#snapshot.assessments[classification] ?? 0) + 1;
    if (missingEvidence) this.#snapshot.assessmentsMissingEvidence += 1;
  }

  scopeIdentityCollision(): void {
    this.#snapshot.scopeIdentityCollisions += 1;
  }

  caseOpened(): void {
    this.#snapshot.casesOpened += 1;
  }

  caseUnresolved(): void {
    this.#snapshot.casesUnresolved += 1;
  }

  caseBlocked(): void {
    this.#snapshot.casesBlocked += 1;
  }

  route(routeCode: RouteCode): void {
    this.#snapshot.routes[routeCode] = (this.#snapshot.routes[routeCode] ?? 0) + 1;
  }

  repeatedRouteCycle(): void {
    this.#snapshot.repeatedRouteCycles += 1;
  }

  checkpointProposal(): void {
    this.#snapshot.checkpointProposals += 1;
  }

  checkpointAcceptance(outcome: CheckpointAcceptanceOutcome): void {
    this.#snapshot.checkpointAcceptances[outcome] += 1;
  }

  evidenceResolverFailure(): void {
    this.#snapshot.evidenceResolverFailures += 1;
  }

  latency(operation: ThreadKeeperLatencyOperation, milliseconds: number): void {
    const value = finiteNonNegative(milliseconds);
    const values = this.#snapshot.latencies[operation] ?? [];
    values.push(value);
    this.#snapshot.latencies[operation] = values;
  }

  snapshot(): ThreadKeeperMetricSnapshot {
    return structuredClone(this.#snapshot);
  }
}
