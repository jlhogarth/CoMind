import { QueryFunction } from './db.js';

export type FoundryLifecycleTerminalStatus = 'succeeded' | 'failed' | 'cancelled' | 'blocked';
export type FoundryLifecycleConsistency = 'open' | 'consistent' | 'inconsistent';

const TERMINAL_STATUSES: readonly FoundryLifecycleTerminalStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
];

export class FoundryLifecycleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'FoundryLifecycleError';
  }
}

export interface FinalizeBoundedFoundryWorkInput {
  readonly taskId: string;
  readonly workerInstanceId: string;
  readonly leaseToken: string;
  readonly fencingEpoch: string | number;
  readonly executionContextId: string;
  readonly adapterOperationId: string;
  readonly terminalStatus: FoundryLifecycleTerminalStatus;
}

export interface FinalizeBoundedFoundryWorkResult {
  readonly finalized: true;
  readonly taskStatus: 'done' | 'blocked';
  readonly leaseState: 'completed' | 'exhausted';
}

interface FinalizeRow {
  finalized: boolean;
  task_status: string | null;
  lease_state: string | null;
}

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FoundryLifecycleError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function assertTerminalStatus(status: string): asserts status is FoundryLifecycleTerminalStatus {
  if (!TERMINAL_STATUSES.includes(status as FoundryLifecycleTerminalStatus)) {
    throw new FoundryLifecycleError('invalid_terminal_status', 'Unsupported Foundry terminal status');
  }
}

export async function finalizeBoundedFoundryWork(
  queryFn: QueryFunction,
  input: FinalizeBoundedFoundryWorkInput
): Promise<FinalizeBoundedFoundryWorkResult> {
  requiredText(input.taskId, 'taskId');
  requiredText(input.workerInstanceId, 'workerInstanceId');
  requiredText(input.leaseToken, 'leaseToken');
  requiredText(input.executionContextId, 'executionContextId');
  requiredText(input.adapterOperationId, 'adapterOperationId');
  assertTerminalStatus(input.terminalStatus);

  const result = await queryFn<FinalizeRow>(
    `WITH guarded AS MATERIALIZED (
       SELECT l.task_id
       FROM comind.cm_foundry_work_lease AS l
       JOIN comind.cm_task AS t
         ON t.task_id = l.task_id
       JOIN comind.cm_foundry_execution_context AS ec
         ON ec.task_id = t.task_id
       JOIN comind.cm_foundry_adapter_operation AS ao
         ON ao.execution_context_id = ec.execution_context_id
       JOIN comind.cm_foundry_adapter_operation_result AS ar
         ON ar.adapter_operation_id = ao.adapter_operation_id
       JOIN comind.cm_foundry_execution_outcome AS eo
         ON eo.execution_context_id = ec.execution_context_id
        AND eo.adapter_operation_result_id = ar.adapter_operation_result_id
       WHERE l.task_id = $1::uuid
         AND l.state = 'leased'
         AND l.worker_instance_id = $2::text
         AND l.lease_token = $3::uuid
         AND l.fencing_epoch = $4::bigint
         AND l.lease_expires_at > clock_timestamp()
         AND l.max_attempts = 1
         AND l.attempt_count = 1
         AND t.status IN ('todo', 'in_progress')
         AND ec.execution_context_id = $5::uuid
         AND ao.adapter_operation_id = $6::uuid
         AND ar.terminal_status = $7::text
         AND eo.terminal_status = $7::text
       FOR UPDATE OF l, t
     ), finished AS MATERIALIZED (
       SELECT comind.cm_foundry_finish_work(
         $1::uuid,
         $2::text,
         $3::uuid,
         $4::bigint,
         ($7::text = 'succeeded')
       ) AS ok
       FROM guarded
     ), task_updated AS (
       UPDATE comind.cm_task AS t
       SET status = CASE WHEN $7::text = 'succeeded' THEN 'done' ELSE 'blocked' END
       WHERE t.task_id = $1::uuid
         AND EXISTS (SELECT 1 FROM finished WHERE ok)
       RETURNING t.status
     )
     SELECT COALESCE((SELECT ok FROM finished), false) AS finalized,
            (SELECT status FROM task_updated) AS task_status,
            CASE
              WHEN COALESCE((SELECT ok FROM finished), false)
                THEN CASE WHEN $7::text = 'succeeded' THEN 'completed' ELSE 'exhausted' END
              ELSE NULL
            END AS lease_state`,
    [
      input.taskId,
      input.workerInstanceId,
      input.leaseToken,
      input.fencingEpoch,
      input.executionContextId,
      input.adapterOperationId,
      input.terminalStatus,
    ]
  );

  const row = result.rows[0];
  if (!row?.finalized) {
    throw new FoundryLifecycleError(
      'fence_rejected',
      'Foundry terminalization was rejected because the bounded lease, fence, execution, operation, or terminal evidence did not match'
    );
  }

  const expectedTaskStatus = input.terminalStatus === 'succeeded' ? 'done' : 'blocked';
  const expectedLeaseState = input.terminalStatus === 'succeeded' ? 'completed' : 'exhausted';
  if (row.task_status !== expectedTaskStatus || row.lease_state !== expectedLeaseState) {
    throw new FoundryLifecycleError(
      'terminal_state_mismatch',
      'Foundry terminalization returned a task or lease state inconsistent with the terminal outcome'
    );
  }

  return Object.freeze({
    finalized: true,
    taskStatus: expectedTaskStatus,
    leaseState: expectedLeaseState,
  });
}

interface LifecycleRow {
  task_id: string;
  task_status: string;
  lease_state: string | null;
  attempt_count: number | string | null;
  max_attempts: number | string | null;
  fencing_epoch: number | string | null;
  execution_context_id: string;
  execution_header_closed_at: string | null;
  execution_terminal_status: FoundryLifecycleTerminalStatus | null;
  execution_terminal_at: string | null;
  execution_effective_state: string;
  adapter_operation_id: string | null;
  adapter_header_status: string | null;
  adapter_header_completed_at: string | null;
  adapter_terminal_status: FoundryLifecycleTerminalStatus | null;
  adapter_terminal_at: string | null;
  adapter_effective_state: string | null;
  lifecycle_consistency: FoundryLifecycleConsistency;
}

export interface FoundryLifecycleProjection {
  readonly taskId: string;
  readonly taskStatus: string;
  readonly leaseState: string | null;
  readonly attemptCount: number | null;
  readonly maxAttempts: number | null;
  readonly fencingEpoch: number | null;
  readonly executionContextId: string;
  readonly executionHeaderClosedAt: string | null;
  readonly executionTerminalStatus: FoundryLifecycleTerminalStatus | null;
  readonly executionTerminalAt: string | null;
  readonly executionEffectiveState: 'open' | 'closed';
  readonly adapterOperationId: string | null;
  readonly adapterHeaderStatus: string | null;
  readonly adapterHeaderCompletedAt: string | null;
  readonly adapterTerminalStatus: FoundryLifecycleTerminalStatus | null;
  readonly adapterTerminalAt: string | null;
  readonly adapterEffectiveState: string | null;
  readonly lifecycleConsistency: FoundryLifecycleConsistency;
}

function nullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new FoundryLifecycleError('malformed_projection', 'Foundry lifecycle projection contains a non-integer counter');
  }
  return parsed;
}

export async function readFoundryLifecycle(
  queryFn: QueryFunction,
  executionContextId: string
): Promise<FoundryLifecycleProjection> {
  requiredText(executionContextId, 'executionContextId');
  const result = await queryFn<LifecycleRow>(
    `SELECT t.task_id::text,
            t.status AS task_status,
            l.state AS lease_state,
            l.attempt_count,
            l.max_attempts,
            l.fencing_epoch,
            ec.execution_context_id::text,
            ec.closed_at::text AS execution_header_closed_at,
            eo.terminal_status AS execution_terminal_status,
            eo.created_at::text AS execution_terminal_at,
            CASE WHEN eo.execution_outcome_id IS NULL THEN 'open' ELSE 'closed' END AS execution_effective_state,
            ao.adapter_operation_id::text,
            ao.status AS adapter_header_status,
            ao.completed_at::text AS adapter_header_completed_at,
            ar.terminal_status AS adapter_terminal_status,
            ar.created_at::text AS adapter_terminal_at,
            CASE
              WHEN ar.adapter_operation_result_id IS NOT NULL THEN ar.terminal_status
              ELSE ao.status
            END AS adapter_effective_state,
            CASE
              WHEN eo.execution_outcome_id IS NULL AND ar.adapter_operation_result_id IS NULL THEN 'open'
              WHEN eo.execution_outcome_id IS NULL OR ar.adapter_operation_result_id IS NULL THEN 'inconsistent'
              WHEN eo.terminal_status <> ar.terminal_status THEN 'inconsistent'
              WHEN eo.terminal_status = 'succeeded' AND l.state = 'completed' AND t.status = 'done' THEN 'consistent'
              WHEN eo.terminal_status IN ('failed', 'cancelled', 'blocked') AND l.state = 'exhausted' AND t.status = 'blocked' THEN 'consistent'
              ELSE 'inconsistent'
            END AS lifecycle_consistency
     FROM comind.cm_foundry_execution_context AS ec
     JOIN comind.cm_task AS t
       ON t.task_id = ec.task_id
     LEFT JOIN comind.cm_foundry_work_lease AS l
       ON l.task_id = t.task_id
     LEFT JOIN comind.cm_foundry_execution_outcome AS eo
       ON eo.execution_context_id = ec.execution_context_id
     LEFT JOIN comind.cm_foundry_adapter_operation AS ao
       ON ao.execution_context_id = ec.execution_context_id
     LEFT JOIN comind.cm_foundry_adapter_operation_result AS ar
       ON ar.adapter_operation_id = ao.adapter_operation_id
     WHERE ec.execution_context_id = $1::uuid`,
    [executionContextId]
  );

  if (result.rows.length !== 1) {
    throw new FoundryLifecycleError(
      'projection_not_unique',
      'Foundry lifecycle projection did not resolve exactly one execution and adapter operation'
    );
  }

  const row = result.rows[0];
  return Object.freeze({
    taskId: row.task_id,
    taskStatus: row.task_status,
    leaseState: row.lease_state,
    attemptCount: nullableNumber(row.attempt_count),
    maxAttempts: nullableNumber(row.max_attempts),
    fencingEpoch: nullableNumber(row.fencing_epoch),
    executionContextId: row.execution_context_id,
    executionHeaderClosedAt: row.execution_header_closed_at,
    executionTerminalStatus: row.execution_terminal_status,
    executionTerminalAt: row.execution_terminal_at,
    executionEffectiveState: row.execution_effective_state as 'open' | 'closed',
    adapterOperationId: row.adapter_operation_id,
    adapterHeaderStatus: row.adapter_header_status,
    adapterHeaderCompletedAt: row.adapter_header_completed_at,
    adapterTerminalStatus: row.adapter_terminal_status,
    adapterTerminalAt: row.adapter_terminal_at,
    adapterEffectiveState: row.adapter_effective_state,
    lifecycleConsistency: row.lifecycle_consistency,
  });
}
