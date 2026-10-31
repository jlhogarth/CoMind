export type AedWakeSource = 'event' | 'durable_timer';

export type AedTemporalWakePlan = {
  wake: 'event' | 'durable_timer' | 'adaptive_poll' | 'none';
  delayMs: number;
  fallbackWakeAt?: string | null;
  band: string;
  diagnosticTrigger: boolean;
  reason: string;
};

export type AedExternalWake = {
  eventId: string;
  observedAt: string;
  cause: string;
};

export type AedTemporalWorkflowInput = {
  laneId: string;
  lifecycleState: string;
  semanticLastProgressAt: string;
  plan: AedTemporalWakePlan;
  heartbeatProbeIterations?: number;
  heartbeatProbeIntervalMs?: number;
};

export type AedHeartbeatProbeInput = {
  laneId: string;
  semanticLastProgressAt: string;
  iterations: number;
  intervalMs: number;
};

export type AedHeartbeatProbeResult = {
  heartbeatCount: number;
  semanticLastProgressAt: string;
  lastObservedAt: string;
  semanticProgressMutated: false;
};

export type AedTemporalWorkflowResult = {
  laneId: string;
  lifecycleState: string;
  wakeSource: AedWakeSource;
  externalWake: AedExternalWake | null;
  semanticLastProgressAt: string;
  heartbeat: AedHeartbeatProbeResult;
  plan: AedTemporalWakePlan;
};
