import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import postgres from 'postgres'

const AUDIENCE = 'comind-foundry-test'
const ISSUER = 'https://token.actions.githubusercontent.com'
const REPOSITORY = 'jlhogarth/CoMind'
const REPOSITORY_ID = '1028814081'
const WORKFLOW_PREFIX = 'jlhogarth/CoMind/.github/workflows/foundry-bounded-agent-test.yml@'
const TEST_REF = 'refs/heads/foundry-161-bounded-agent'
const MAIN_REF = 'refs/heads/main'
const TASK_ID = '16100000-0000-4000-8000-000000000009'
const PROFILE_ID = '16100000-0000-4000-8000-000000000006'
const CAPABILITY_ID = '16100000-0000-4000-8000-000000000007'
const CAPABILITY_CODE = 'foundry.test.proof.verify'
const AUTH_DECISION_ID = '16100000-0000-4000-8000-00000000000b'
const TARGET_REF = 'jlhogarth/CoMind'
const PROVIDER = 'ollama'
const MODEL = 'qwen2.5:0.5b'
const MAX_OUTPUT_CHARS = 1800
const LEASE_SECONDS = 300

const dbUrl = Deno.env.get('SUPABASE_DB_URL')
if (!dbUrl) throw new Error('SUPABASE_DB_URL is unavailable')

const sql = postgres(dbUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))

class WorkerError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message)
    this.name = 'WorkerError'
  }
}

type Claims = JWTPayload & {
  repository?: string
  repository_id?: string | number
  event_name?: string
  workflow_ref?: string
  workflow_sha?: string
  ref?: string
  run_id?: string | number
  run_attempt?: string | number
  actor?: string
  actor_id?: string | number
  runner_environment?: string
}

type CompleteBody = {
  action: 'complete'
  taskId: string
  workerId: string
  leaseToken: string
  fencingEpoch: string
  executionContextId: string
  adapterOperationId: string
  agentRunId: string
  output: string
  modelMeta?: {
    model?: string
    doneReason?: string
    promptEvalCount?: number
    evalCount?: number
    totalDuration?: number
  }
}

type Body = { action: 'claim' } | CompleteBody | { action: 'verify' }

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function requiredText(value: unknown, name: string, maxLength = 2048): string {
  if (typeof value !== 'string') {
    throw new WorkerError('invalid_request', `${name} must be text`)
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) {
    throw new WorkerError('invalid_request', `${name} length is invalid`)
  }
  return trimmed
}

function workerIdFor(claims: Claims): string {
  const runId = requiredText(String(claims.run_id ?? ''), 'run_id', 64)
  const attempt = requiredText(String(claims.run_attempt ?? ''), 'run_attempt', 16)
  return `gha:${runId}:${attempt}`
}

async function authorize(req: Request): Promise<Claims> {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) {
    throw new WorkerError('missing_identity', 'GitHub OIDC bearer token is required', 401)
  }

  const { payload } = await jwtVerify(header.slice(7), jwks, {
    issuer: ISSUER,
    audience: AUDIENCE,
  })
  const claims = payload as Claims

  if (claims.repository !== REPOSITORY) {
    throw new WorkerError('repository_denied', 'Repository is not authorized', 403)
  }
  if (String(claims.repository_id ?? '') !== REPOSITORY_ID) {
    throw new WorkerError('repository_identity_denied', 'Repository identity is not authorized', 403)
  }
  if (typeof claims.workflow_ref !== 'string' || !claims.workflow_ref.startsWith(WORKFLOW_PREFIX)) {
    throw new WorkerError('workflow_denied', 'Workflow is not authorized', 403)
  }
  if (claims.runner_environment !== 'github-hosted') {
    throw new WorkerError('runner_denied', 'Only GitHub-hosted runners are authorized', 403)
  }

  const acceptedPush = claims.event_name === 'push' && claims.ref === TEST_REF
  const acceptedDispatch =
    claims.event_name === 'workflow_dispatch' &&
    (claims.ref === TEST_REF || claims.ref === MAIN_REF)
  if (!acceptedPush && !acceptedDispatch) {
    throw new WorkerError(
      'event_denied',
      'Only the bounded Test activation or manual dispatch is authorized',
      403,
    )
  }

  requiredText(String(claims.workflow_sha ?? ''), 'workflow_sha', 64)
  requiredText(String(claims.run_id ?? ''), 'run_id', 64)
  requiredText(String(claims.run_attempt ?? ''), 'run_attempt', 16)
  return claims
}

async function sha256Hex(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function authorityRank(level: string): number {
  const match = /^C([0-4])$/.exec(level)
  return match ? Number(match[1]) : -1
}

function targetAllowed(scope: unknown): boolean {
  if (!scope || typeof scope !== 'object') return false
  const refs = (scope as Record<string, unknown>).target_refs
  return Array.isArray(refs) && refs.includes(TARGET_REF)
}

function proofPrompt(description: string): string {
  return [
    'ROLE: PROOF verifier.',
    'You are receiving a synthetic handoff from ATLAS. Do not add outside facts.',
    'Evaluate the ATLAS proposal using only the supplied evidence.',
    'Return only one JSON object with exactly these keys:',
    '{"verdict":"supported|unsupported","reason":"short evidence-grounded reason"}',
    'The correct verdict must follow from the supplied evidence, not confidence or plausibility.',
    '',
    description,
  ].join('\n')
}

async function claimOne(claims: Claims): Promise<unknown> {
  const workerId = workerIdFor(claims)

  return await sql.begin(async (tx) => {
    const claimed = await tx`
      SELECT task_id::text, lease_token::text, fencing_epoch, lease_expires_at
      FROM comind.cm_foundry_claim_work(${workerId}, ${LEASE_SECONDS})
    `
    if (claimed.length !== 1) {
      throw new WorkerError('no_work', 'No eligible Issue #161 work item is available', 409)
    }
    const lease = claimed[0]
    if (lease.task_id !== TASK_ID) {
      throw new WorkerError('unexpected_task', 'Dispatcher returned a task outside Issue #161')
    }

    const rows = await tx`
      SELECT
        t.task_id::text,
        t.project_id::text,
        t.description,
        p.profile_id::text,
        p.agent_id::text,
        p.status AS profile_status,
        p.authority_ceiling AS profile_authority_ceiling,
        c.capability_id::text,
        c.capability_code,
        c.action AS capability_action,
        c.target_kind AS capability_target_kind,
        c.max_authority AS capability_max_authority,
        c.cost_bearing,
        c.adapter,
        g.authority_ceiling AS grant_authority_ceiling,
        g.scope AS grant_scope,
        g.expires_at AS grant_expires_at,
        g.revoked_at AS grant_revoked_at,
        ad.authorization_decision_id::text,
        ad.decision AS authorization_decision,
        ar.status AS request_status,
        ar.authority_level AS request_authority_level,
        ar.environment AS request_environment,
        ar.target_kind AS request_target_kind,
        ar.target_ref AS request_target_ref
      FROM comind.cm_task AS t
      JOIN comind.cm_foundry_authorization_request AS ar
        ON ar.task_id = t.task_id
      JOIN comind.cm_foundry_authorization_decision AS ad
        ON ad.authorization_request_id = ar.authorization_request_id
      JOIN comind.cm_foundry_agent_profile AS p
        ON p.profile_id = ar.requesting_profile_id
      JOIN comind.cm_foundry_capability AS c
        ON c.capability_id = ar.capability_id
      JOIN comind.cm_foundry_capability_grant AS g
        ON g.profile_id = p.profile_id
       AND g.capability_id = c.capability_id
       AND g.org_id = p.org_id
       AND g.environment = ar.environment
       AND g.project_id = t.project_id
      WHERE t.task_id = ${TASK_ID}::uuid
        AND p.profile_id = ${PROFILE_ID}::uuid
        AND c.capability_id = ${CAPABILITY_ID}::uuid
        AND ad.authorization_decision_id = ${AUTH_DECISION_ID}::uuid
    `
    if (rows.length !== 1) {
      throw new WorkerError('authority_not_unique', 'Issue #161 authority envelope is not unique')
    }

    const authority = rows[0]
    if (authority.profile_status !== 'active') {
      throw new WorkerError('profile_inactive', 'PROOF profile is not active')
    }
    if (authority.capability_code !== CAPABILITY_CODE || authority.adapter !== 'ollama_local') {
      throw new WorkerError('capability_mismatch', 'Local capability contract mismatch')
    }
    if (
      authority.capability_target_kind !== 'repository' ||
      authority.request_target_kind !== 'repository' ||
      authority.request_target_ref !== TARGET_REF
    ) {
      throw new WorkerError('target_mismatch', 'Authorization target mismatch')
    }
    if (authority.request_environment !== 'isolated') {
      throw new WorkerError('environment_blocked', 'Execution must remain isolated')
    }
    if (authority.authorization_decision !== 'approved' || authority.request_status !== 'approved') {
      throw new WorkerError('authorization_denied', 'Execution is not approved')
    }
    if (
      authority.request_authority_level !== 'C1' ||
      authorityRank(authority.profile_authority_ceiling) < 1 ||
      authorityRank(authority.capability_max_authority) < 1 ||
      authorityRank(authority.grant_authority_ceiling) < 1
    ) {
      throw new WorkerError('authority_exceeded', 'C1 authority is not permitted')
    }
    if (authority.cost_bearing) {
      throw new WorkerError('cost_policy_violation', 'Local inference must not be cost-bearing')
    }
    if (authority.grant_revoked_at !== null) {
      throw new WorkerError('grant_revoked', 'Capability grant is revoked')
    }
    if (
      authority.grant_expires_at !== null &&
      new Date(authority.grant_expires_at).getTime() <= Date.now()
    ) {
      throw new WorkerError('grant_expired', 'Capability grant is expired')
    }
    if (!targetAllowed(authority.grant_scope)) {
      throw new WorkerError('grant_scope_mismatch', 'Capability grant does not cover CoMind')
    }

    const prior = await tx`
      SELECT count(*)::int AS count
      FROM comind.cm_foundry_execution_context
      WHERE task_id = ${TASK_ID}::uuid
    `
    if (prior[0]?.count !== 0) {
      throw new WorkerError('execution_already_exists', 'Issue #161 already has execution evidence', 409)
    }

    const runs = await tx`
      INSERT INTO comind.cm_agent_run (agent_id, status)
      VALUES (${authority.agent_id}::uuid, 'running')
      RETURNING run_id::text
    `
    if (runs.length !== 1) {
      throw new WorkerError('agent_run_creation_failed', 'Agent run was not created uniquely')
    }

    const runId = String(claims.run_id)
    const runAttempt = String(claims.run_attempt)
    const idempotencyKey = `issue161:${runId}:${runAttempt}`
    const metadata = {
      issue: 161,
      synthetic: true,
      source_role: 'atlas',
      executing_role: 'proof',
      provider: PROVIDER,
      model: MODEL,
      provider_cost: 0,
      worker: {
        kind: 'github_actions',
        instance_id: workerId,
      },
      github: {
        event_name: claims.event_name,
        repository: claims.repository,
        repository_id: String(claims.repository_id),
        workflow_ref: claims.workflow_ref,
        workflow_sha: claims.workflow_sha,
        ref: claims.ref,
        run_id: runId,
        run_attempt: runAttempt,
        actor: claims.actor ?? null,
        actor_id: claims.actor_id ? String(claims.actor_id) : null,
      },
    }

    const requestFingerprint = await sha256Hex({
      profile_id: authority.profile_id,
      capability_code: authority.capability_code,
      authorization_decision_id: authority.authorization_decision_id,
      authority_level: 'C1',
      environment: 'isolated',
      target_kind: 'repository',
      target_ref: TARGET_REF,
      project_id: authority.project_id,
      task_id: authority.task_id,
      agent_run_id: runs[0].run_id,
      idempotency_key: idempotencyKey,
      provider: PROVIDER,
      model: MODEL,
      github_run_id: runId,
      github_run_attempt: runAttempt,
    })

    const contextValue = {
      ...metadata,
      request_fingerprint: requestFingerprint,
    }
    const contexts = await tx`
      INSERT INTO comind.cm_foundry_execution_context (
        profile_id,
        agent_run_id,
        project_id,
        task_id,
        capability_id,
        authorization_decision_id,
        environment,
        execution_kind,
        idempotency_key,
        context
      ) VALUES (
        ${authority.profile_id}::uuid,
        ${runs[0].run_id}::uuid,
        ${authority.project_id}::uuid,
        ${authority.task_id}::uuid,
        ${authority.capability_id}::uuid,
        ${authority.authorization_decision_id}::uuid,
        'isolated',
        'adapter_operation',
        ${idempotencyKey},
        ${tx.json(contextValue)}
      )
      RETURNING execution_context_id::text
    `
    const executionContextId = contexts[0]?.execution_context_id
    if (!executionContextId) {
      throw new WorkerError('execution_context_creation_failed', 'Execution context was not created')
    }

    const checkpoints = await tx`
      INSERT INTO comind.cm_foundry_recovery_checkpoint (
        execution_context_id,
        project_id,
        checkpoint_kind,
        source_ref,
        durable_summary,
        evidence_refs,
        created_by_profile_id
      ) VALUES (
        ${executionContextId}::uuid,
        ${authority.project_id}::uuid,
        'provenance_snapshot',
        ${`foundry-test-161:${requestFingerprint}`},
        'Issue #161 lease claimed and authority envelope validated before local model dispatch.',
        ${tx.json(['github:issue:161', 'github:issue:114'])},
        ${authority.profile_id}::uuid
      )
      RETURNING recovery_checkpoint_id::text
    `

    const operations = await tx`
      INSERT INTO comind.cm_foundry_adapter_operation (
        execution_context_id,
        capability_id,
        adapter,
        operation_name,
        target_kind,
        target_ref,
        idempotency_key,
        request_fingerprint,
        status
      ) VALUES (
        ${executionContextId}::uuid,
        ${authority.capability_id}::uuid,
        'ollama_local',
        ${authority.capability_action},
        'repository',
        ${TARGET_REF},
        ${`adapter:${requestFingerprint}`},
        ${requestFingerprint},
        'approved'
      )
      RETURNING adapter_operation_id::text
    `

    if (checkpoints.length !== 1 || operations.length !== 1) {
      throw new WorkerError('dispatch_persistence_failed', 'Dispatch evidence was not created uniquely')
    }

    return {
      taskId: authority.task_id,
      workerId,
      leaseToken: lease.lease_token,
      fencingEpoch: String(lease.fencing_epoch),
      leaseExpiresAt: lease.lease_expires_at,
      executionContextId,
      recoveryCheckpointId: checkpoints[0].recovery_checkpoint_id,
      adapterOperationId: operations[0].adapter_operation_id,
      agentRunId: runs[0].run_id,
      requestFingerprint,
      provider: PROVIDER,
      model: MODEL,
      maxOutputChars: MAX_OUTPUT_CHARS,
      prompt: proofPrompt(authority.description),
    }
  })
}

async function completeOne(claims: Claims, body: CompleteBody): Promise<unknown> {
  const expectedWorkerId = workerIdFor(claims)
  const taskId = requiredText(body.taskId, 'taskId', 64)
  const workerId = requiredText(body.workerId, 'workerId', 128)
  const leaseToken = requiredText(body.leaseToken, 'leaseToken', 64)
  const fencingEpoch = requiredText(body.fencingEpoch, 'fencingEpoch', 32)
  const executionContextId = requiredText(body.executionContextId, 'executionContextId', 64)
  const adapterOperationId = requiredText(body.adapterOperationId, 'adapterOperationId', 64)
  const agentRunId = requiredText(body.agentRunId, 'agentRunId', 64)
  const output = requiredText(body.output, 'output', MAX_OUTPUT_CHARS)

  if (
    taskId !== TASK_ID ||
    workerId !== expectedWorkerId ||
    !/^\d+$/.test(fencingEpoch)
  ) {
    throw new WorkerError('lease_scope_mismatch', 'Completion does not match the active Issue #161 lease')
  }

  let parsedOutput: unknown = null
  try {
    parsedOutput = JSON.parse(output)
  } catch {
    parsedOutput = null
  }

  const verdict =
    parsedOutput && typeof parsedOutput === 'object'
      ? (parsedOutput as Record<string, unknown>).verdict
      : null
  const reason =
    parsedOutput && typeof parsedOutput === 'object'
      ? (parsedOutput as Record<string, unknown>).reason
      : null
  const wellFormed =
    (verdict === 'supported' || verdict === 'unsupported') &&
    typeof reason === 'string' &&
    reason.trim().length >= 1 &&
    reason.trim().length <= 1200
  const proofPassed = wellFormed && verdict === 'unsupported'
  const terminalStatus = proofPassed ? 'succeeded' : 'failed'
  const errorCode = proofPassed
    ? null
    : wellFormed
      ? 'proof_verdict_mismatch'
      : 'malformed_model_output'
  const summary = proofPassed
    ? `PROOF verdict: unsupported. ${String(reason).trim()}`
    : wellFormed
      ? `PROOF returned an evidence-inconsistent verdict: ${String(verdict)}. ${String(reason).trim()}`
      : 'PROOF did not return the required bounded JSON verdict and reason.'

  return await sql.begin(async (tx) => {
    const leases = await tx`
      SELECT
        state,
        worker_instance_id,
        lease_token::text,
        fencing_epoch::text,
        lease_expires_at > clock_timestamp() AS lease_active
      FROM comind.cm_foundry_work_lease
      WHERE task_id = ${taskId}::uuid
      FOR UPDATE
    `
    const lease = leases[0]
    if (
      !lease ||
      lease.state !== 'leased' ||
      lease.worker_instance_id !== workerId ||
      lease.lease_token !== leaseToken ||
      lease.fencing_epoch !== fencingEpoch ||
      !lease.lease_active
    ) {
      throw new WorkerError('lease_stale', 'Completion does not hold the current live lease', 409)
    }

    const executions = await tx`
      SELECT
        ec.context #>> '{github,run_id}' AS github_run_id,
        ec.context ->> 'provider' AS provider,
        ec.context ->> 'model' AS model,
        (
          SELECT count(*)::int
          FROM comind.cm_foundry_adapter_operation_result AS r
          WHERE r.adapter_operation_id = ao.adapter_operation_id
        ) AS prior_result_count
      FROM comind.cm_foundry_execution_context AS ec
      JOIN comind.cm_foundry_adapter_operation AS ao
        ON ao.execution_context_id = ec.execution_context_id
      WHERE ec.task_id = ${taskId}::uuid
        AND ec.execution_context_id = ${executionContextId}::uuid
        AND ao.adapter_operation_id = ${adapterOperationId}::uuid
        AND ec.agent_run_id = ${agentRunId}::uuid
    `
    const execution = executions[0]
    if (!execution) {
      throw new WorkerError('execution_scope_mismatch', 'Completion does not match prepared execution')
    }
    if (
      execution.github_run_id !== String(claims.run_id) ||
      execution.provider !== PROVIDER ||
      execution.model !== MODEL
    ) {
      throw new WorkerError('execution_provenance_mismatch', 'Completion provenance mismatch')
    }
    if (execution.prior_result_count !== 0) {
      throw new WorkerError('duplicate_completion', 'Execution already has a terminal result', 409)
    }

    const modelMeta = {
      model: body.modelMeta?.model ?? MODEL,
      done_reason: body.modelMeta?.doneReason ?? null,
      prompt_eval_count: body.modelMeta?.promptEvalCount ?? null,
      eval_count: body.modelMeta?.evalCount ?? null,
      total_duration: body.modelMeta?.totalDuration ?? null,
    }
    if (modelMeta.model !== MODEL) {
      throw new WorkerError('model_mismatch', 'Completion model is not authorized')
    }

    const resultRefHash = await sha256Hex({
      task_id: taskId,
      execution_context_id: executionContextId,
      adapter_operation_id: adapterOperationId,
      provider: PROVIDER,
      model: MODEL,
      model_meta: modelMeta,
      output,
    })
    const resultRef = `urn:comind:foundry-test:161:${resultRefHash}`
    const resultFingerprint = await sha256Hex({
      adapter_operation_id: adapterOperationId,
      terminal_status: terminalStatus,
      result_ref: resultRef,
      error_code: errorCode,
      summary,
    })

    const results = await tx`
      INSERT INTO comind.cm_foundry_adapter_operation_result (
        adapter_operation_id,
        terminal_status,
        result_ref,
        result_fingerprint,
        error_code,
        summary
      ) VALUES (
        ${adapterOperationId}::uuid,
        ${terminalStatus},
        ${resultRef},
        ${resultFingerprint},
        ${errorCode},
        ${summary}
      )
      RETURNING adapter_operation_result_id::text
    `

    const outcomes = await tx`
      INSERT INTO comind.cm_foundry_execution_outcome (
        execution_context_id,
        adapter_operation_result_id,
        terminal_status,
        error_code,
        summary
      ) VALUES (
        ${executionContextId}::uuid,
        ${results[0].adapter_operation_result_id}::uuid,
        ${terminalStatus},
        ${errorCode},
        ${summary}
      )
      RETURNING execution_outcome_id::text
    `

    const finish = await tx`
      SELECT comind.cm_foundry_finish_work(
        ${taskId}::uuid,
        ${workerId},
        ${leaseToken}::uuid,
        ${fencingEpoch}::bigint,
        ${proofPassed}
      ) AS finished
    `
    if (finish[0]?.finished !== true) {
      throw new WorkerError('lease_finish_failed', 'Lease could not be finished with the current fence')
    }

    await tx`
      UPDATE comind.cm_agent_run
      SET status = ${proofPassed ? 'succeeded' : 'failed'},
          finished_at = clock_timestamp()
      WHERE run_id = ${agentRunId}::uuid
        AND status = 'running'
    `
    await tx`
      UPDATE comind.cm_task
      SET status = ${proofPassed ? 'done' : 'blocked'},
          updated_at = clock_timestamp()
      WHERE task_id = ${taskId}::uuid
    `

    return {
      taskId,
      executionContextId,
      adapterOperationResultId: results[0].adapter_operation_result_id,
      executionOutcomeId: outcomes[0].execution_outcome_id,
      terminalStatus,
      errorCode,
      resultRef,
      summary,
      modelMeta,
    }
  })
}

async function verifyOne(claims: Claims): Promise<unknown> {
  const rows = await sql`
    SELECT
      l.state AS lease_state,
      l.attempt_count,
      l.max_attempts,
      l.worker_instance_id,
      (SELECT count(*)::int FROM comind.cm_foundry_work_lease_event e WHERE e.task_id=l.task_id AND e.event_type='claimed') AS claimed_events,
      (SELECT count(*)::int FROM comind.cm_foundry_work_lease_event e WHERE e.task_id=l.task_id AND e.event_type='completed') AS completed_events,
      (SELECT count(*)::int FROM comind.cm_foundry_work_lease_event e WHERE e.task_id=l.task_id AND e.event_type='released') AS released_events,
      (SELECT count(*)::int FROM comind.cm_foundry_work_lease_event e WHERE e.task_id=l.task_id AND e.event_type='exhausted') AS exhausted_events,
      (SELECT count(*)::int FROM comind.cm_foundry_execution_context x WHERE x.task_id=l.task_id) AS execution_contexts,
      (SELECT count(*)::int FROM comind.cm_foundry_adapter_operation ao JOIN comind.cm_foundry_execution_context x ON x.execution_context_id=ao.execution_context_id WHERE x.task_id=l.task_id) AS adapter_operations,
      (SELECT count(*)::int FROM comind.cm_foundry_adapter_operation_result r JOIN comind.cm_foundry_adapter_operation ao ON ao.adapter_operation_id=r.adapter_operation_id JOIN comind.cm_foundry_execution_context x ON x.execution_context_id=ao.execution_context_id WHERE x.task_id=l.task_id) AS adapter_results,
      (SELECT count(*)::int FROM comind.cm_foundry_execution_outcome o JOIN comind.cm_foundry_execution_context x ON x.execution_context_id=o.execution_context_id WHERE x.task_id=l.task_id) AS execution_outcomes,
      (SELECT count(*)::int FROM comind.cm_foundry_execution_outcome o JOIN comind.cm_foundry_execution_context x ON x.execution_context_id=o.execution_context_id WHERE x.task_id=l.task_id AND o.terminal_status='succeeded') AS succeeded_outcomes,
      t.status AS task_status,
      ec.context ->> 'provider' AS provider,
      ec.context ->> 'model' AS model,
      ec.context #>> '{github,run_id}' AS github_run_id
    FROM comind.cm_foundry_work_lease AS l
    JOIN comind.cm_task AS t ON t.task_id=l.task_id
    LEFT JOIN comind.cm_foundry_execution_context AS ec ON ec.task_id=l.task_id
    WHERE l.task_id=${TASK_ID}::uuid
  `
    
  if (rows.length !== 1) {
    throw new WorkerError('verification_scope_invalid', 'Issue #161 verification did not resolve one execution')
  }

  const row = rows[0]
  const verified =
    row.lease_state === 'completed' &&
    row.attempt_count === 1 &&
    row.max_attempts === 1 &&
    row.worker_instance_id === null &&
    row.claimed_events === 1 &&
    row.completed_events === 1 &&
    row.released_events === 0 &&
    row.exhausted_events === 0 &&
    row.execution_contexts === 1 &&
    row.adapter_operations === 1 &&
    row.adapter_results === 1 &&
    row.execution_outcomes === 1 &&
    row.succeeded_outcomes === 1 &&
    row.task_status === 'done' &&
    row.provider === PROVIDER &&
    row.model === MODEL &&
    row.github_run_id === String(claims.run_id)

  return {
    verified,
    workerId: workerIdFor(claims),
    ...row,
  }
}

function safeDiagnostic(error: unknown): Record<string, string | null> {
  if (!error || typeof error !== 'object') {
    return { error_name: null, sqlstate: null, constraint: null }
  }
  const candidate = error as Record<string, unknown>
  const safe = (value: unknown, pattern: RegExp): string | null => {
    if (typeof value !== 'string' || !pattern.test(value)) return null
    return value
  }
  return {
    error_name: safe(candidate.name, /^[A-Za-z][A-Za-z0-9_]{0,63}$/),
    sqlstate: safe(candidate.code, /^[0-9A-Z]{5}$/),
    constraint: safe(candidate.constraint_name ?? candidate.constraint, /^[A-Za-z0-9_]{1,128}$/),
  }
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      throw new WorkerError('method_not_allowed', 'POST is required', 405)
    }
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new WorkerError('content_type_required', 'application/json is required', 415)
    }

    const claims = await authorize(req)
    const body = await req.json() as Body

    if (body.action === 'claim') return jsonResponse(await claimOne(claims))
    if (body.action === 'complete') return jsonResponse(await completeOne(claims, body))
    if (body.action === 'verify') return jsonResponse(await verifyOne(claims))
    throw new WorkerError('unknown_action', 'Unknown worker action')
  } catch (error) {
    if (error instanceof WorkerError) {
      console.error(JSON.stringify({ code: error.code, status: error.status }))
      return jsonResponse({ error: error.code, message: error.message }, error.status)
    }

    console.error(JSON.stringify({ code: 'internal_error', ...safeDiagnostic(error) }))
    return jsonResponse(
      { error: 'internal_error', message: 'Bounded worker request failed' },
      500,
    )
  }
})
