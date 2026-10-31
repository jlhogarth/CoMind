import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { heartbeat } from '@temporalio/activity';
import {
  assertRecoveryAuthorized,
  type HeartbeatObservation,
  type LaneTransition,
  type RecoveryResult,
} from './contracts.js';

type EvidenceEnvelope = {
  recordedAt: string;
  workerInstanceId: string;
  transition: LaneTransition;
};

function workerInstanceId(): string {
  return process.env.AED003_WORKER_ID?.trim() || 'aed003-worker';
}

function evidencePath(): string {
  const value = process.env.AED003_EVIDENCE_PATH?.trim();
  if (!value) throw new Error('AED003_EVIDENCE_PATH is required');
  return value;
}

async function appendEvidence(envelope: EvidenceEnvelope): Promise<void> {
  const path = evidencePath();
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function recordTransition(transition: LaneTransition): Promise<void> {
  await appendEvidence({
    recordedAt: new Date().toISOString(),
    workerInstanceId: workerInstanceId(),
    transition,
  });
}

export async function observeHeartbeat(input: {
  laneId: string;
  semanticProgressAt: string;
  heartbeatCount: number;
  heartbeatIntervalMs: number;
}): Promise<HeartbeatObservation> {
  const count = Math.max(1, Math.floor(input.heartbeatCount));
  const intervalMs = Math.max(25, Math.floor(input.heartbeatIntervalMs));

  for (let index = 1; index <= count; index += 1) {
    heartbeat({
      laneId: input.laneId,
      sequence: index,
      semanticProgressAt: input.semanticProgressAt,
    });
    if (index < count) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return {
    observedAt: new Date().toISOString(),
    heartbeatCount: count,
  };
}

export async function recoverLane(input: {
  laneId: string;
  clearAuthorized: boolean;
  priorProgressAt: string;
}): Promise<RecoveryResult> {
  assertRecoveryAuthorized(input.clearAuthorized);
  const recoveredAt = new Date().toISOString();
  return {
    recoveredAt,
    semanticProgressAt: recoveredAt,
  };
}

export async function verifyRecovery(input: {
  priorProgressAt: string;
  recoveredProgressAt: string;
}): Promise<{ verified: true; verifiedAt: string }> {
  const prior = Date.parse(input.priorProgressAt);
  const recovered = Date.parse(input.recoveredProgressAt);
  if (!Number.isFinite(prior) || !Number.isFinite(recovered) || recovered <= prior) {
    throw new Error('semantic_progress_not_advanced');
  }
  return {
    verified: true,
    verifiedAt: new Date().toISOString(),
  };
}
