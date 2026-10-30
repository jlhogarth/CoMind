import { createHash } from 'node:crypto';
import { QueryFunction } from './db.js';
import {
  FoundryAdapter,
  FoundryAdapterRegistry,
  FoundryAdapterRequest,
  FoundryAdapterResult,
  FoundryExecutionResult,
  FoundryRuntimeOrchestrator,
  sha256Fingerprint,
} from './foundry-runtime.js';
import type {
  MdoClaimedWork,
  MdoOrchestrator,
  MdoTaskContext,
} from './mdo-orchestrator.js';
import { GovernedMdoOrchestrator } from './rulebook-governed-runtimes.js';

const MDO_CAPABILITIES = new Set([
  'mdo.plan.analyze',
  'mdo.plan.research',
  'mdo.plan.review',
  'mdo.plan.synthesize',
  'mdo.plan.portfolio',
]);
const SAFE_CODE = /^[a-zA-Z0-9._:-]{1,128}$/;
const EVIDENCE_URI = /^comind-evidence:\/\/([0-9a-f-]{36})$/i;
const SENSITIVE_KEY = /(secret|password|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)/i;
const DEFAULT_MAX_PROMPT_CHARS = 5_900;
const DEFAULT_MAX_OUTPUT_CHARS = 32_000;
const OBJECTIVE_EXCERPT_CHARS = 800;
const PRIOR_CONTENT_EXCERPT_CHARS = 224;
const MAX_MODEL_VISIBLE_EVIDENCE_REFS = 2;

export class MdoPlanningRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MdoPlanningRuntimeError';
  }
}

interface MdoRuntimeProfileRow {
  profile_id: string;
  task_id: string | null;
  project_id: string | null;
  runtime_defaults: unknown;
}

interface EvidenceRow {
  evidence_id: string;
  metadata: unknown;
  checksum: string | null;
}

interface LeaseDiagnosticRow {
  state: string;
  worker_matches: boolean;
  token_matches: boolean;
  fencing_epoch: number | string;
  epoch_matches: boolean;
  lease_expires_at: string | null;
  expired: boolean | null;
  attempt_count: number | string;
  max_attempts: number | string;
}

export interface MdoInferenceSelection {
  readonly adapter: string;
  readonly provider: string;
  readonly model: string;
}

export interface MdoInferenceEvidence {
  readonly evidenceId: string;
  readonly taskId: string;
  readonly planId: string;
  readonly roleCode: string;
  readonly deliverableType: string;
  readonly providerAdapter: string;
  readonly provider: string;
  readonly model: string;
  readonly upstreamResultRef: string | null;
  readonly promptChecksum: string;
  readonly outputText: string;
}

export interface MdoFoundryAdapterOptions {
  readonly queryFn: QueryFunction;
  readonly inferenceRegistry: FoundryAdapterRegistry;
  readonly mdo?: Pick<MdoOrchestrator, 'loadTaskContext'>;
  readonly maxPromptChars?: number;
  readonly maxOutputChars?: number;
}

export interface MdoPlanningWorkerOptions {
  readonly queryFn: QueryFunction;
  readonly foundryRuntime: Pick<FoundryRuntimeOrchestrator, 'execute'>;
  readonly mdo?: Pick<MdoOrchestrator, 'loadTaskContext' | 'submitContribution'>;
}

export interface MdoExecuteClaimInput {
  readonly profileId: string;
  readonly workerInstanceId: string;
  readonly authorizationDecisionId: string;
  readonly claim: MdoClaimedWork;
  readonly idempotencyKey: string;
}

export interface MdoExecuteClaimResult {
  readonly taskId: string;
  readonly planId: string;
  readonly contributionId: string;
  readonly evidenceId: string;
  readonly execution: FoundryExecutionResult;
  readonly provider: string;
  readonly model: string;
}

function boundedInteger(value: number, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new MdoPlanningRuntimeError('invalid_configuration', `${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requiredCode(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_CODE.test(value)) {
    throw new MdoPlanningRuntimeError('invalid_provider_configuration', `${field} is missing or invalid`);
  }
  return value;
}

function parseInferenceSelection(runtimeDefaults: unknown): MdoInferenceSelection {
  if (runtimeDefaults === null || typeof runtimeDefaults !== 'object' || Array.isArray(runtimeDefaults)) {
    throw new MdoPlanningRuntimeError('invalid_provider_configuration', 'MDO profile runtime defaults are missing');
  }
  const record = runtimeDefaults as Record<string, unknown>;
  const raw = record.mdo_inference;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MdoPlanningRuntimeError('invalid_provider_configuration', 'MDO profile requires mdo_inference routing configuration');
  }
  const config = raw as Record<string, unknown>;
  const adapter = requiredCode(config.adapter, 'mdo_inference.adapter');
  const provider = requiredCode(config.provider, 'mdo_inference.provider');
  const model = requiredCode(config.model, 'mdo_inference.model');
  if (adapter === 'mdo') {
    throw new MdoPlanningRuntimeError('recursive_provider_configuration', 'MDO inference cannot recursively select the mdo adapter');
  }
  return Object.freeze({ adapter, provider, model });
}

function assertNoSensitiveKeys(value: unknown, path = 'context'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new MdoPlanningRuntimeError(
        'sensitive_context_rejected',
        `Sensitive key rejected from model-visible MDO context at ${path}.${key}`
      );
    }
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

function excerpt(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

function modelVisiblePriorContribution(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({ content_excerpt: '', content_truncated: false, evidence_refs: Object.freeze([]) });
  }
  const record = value as Record<string, unknown>;
  const payload = record.payload !== null && typeof record.payload === 'object' && !Array.isArray(record.payload)
    ? record.payload as Record<string, unknown>
    : null;
  const narrative = typeof payload?.narrative === 'string'
    ? payload.narrative
    : payload === null
      ? ''
      : JSON.stringify(payload) ?? '';
  const content = excerpt(narrative, PRIOR_CONTENT_EXCERPT_CHARS);
  const evidenceRefs = Array.isArray(record.evidence_ids)
    ? record.evidence_ids
        .filter((item): item is string => typeof item === 'string' && SAFE_CODE.test(item))
        .slice(0, MAX_MODEL_VISIBLE_EVIDENCE_REFS)
    : [];
  return Object.freeze({
    role_code: typeof record.role_code === 'string' ? record.role_code : null,
    sequence_no: typeof record.sequence_no === 'number' ? record.sequence_no : Number(record.sequence_no) || null,
    content_excerpt: content.text,
    content_truncated: content.truncated,
    evidence_refs: Object.freeze(evidenceRefs),
  });
}

function canonicalContributionContext(context: MdoTaskContext): Record<string, unknown> {
  assertNoSensitiveKeys(context.priorContributions);
  const objective = excerpt(context.objective, OBJECTIVE_EXCERPT_CHARS);
  const prior = context.priorContributions.map(modelVisiblePriorContribution);
  return {
    module: {
      id: context.moduleId,
      name: context.moduleName,
      code: context.moduleCode,
      lifecycle_stage: context.lifecycleStage,
    },
    plan: {
      id: context.planId,
      objective_excerpt: objective.text,
      objective_truncated: objective.truncated,
      target_stage: context.targetStage,
      status: context.planStatus,
    },
    assignment: {
      role: context.roleCode,
      deliverable_type: context.deliverableType,
      sequence_no: context.sequenceNo,
      capability: context.requiredCapabilityCode,
    },
    prior_contributions: prior,
  };
}

export function buildMdoPlanningPrompt(
  context: MdoTaskContext,
  maxPromptChars = DEFAULT_MAX_PROMPT_CHARS
): string {
  boundedInteger(maxPromptChars, 'maxPromptChars', 1_000, 64_000);
  const modelContext = canonicalContributionContext(context);
  const prompt = [
    'You are a bounded CoMind Module Development Orchestrator planning worker.',
    'Produce only the requested planning deliverable. Do not claim authority to merge, deploy, spend money, change Production, grant capabilities, or advance module maturity.',
    'Prefer reuse of verified CoMind capabilities and trustworthy existing implementations over reinvention.',
    'Separate evidence, assumptions, risks, rejected alternatives, unresolved questions, and recommendations. Do not invent evidence.',
    'Prior contribution content may be a bounded excerpt. Evidence references identify the canonical durable source. Do not infer or fabricate omitted text.',
    'Return concise implementation-planning content that another governed reviewer can inspect.',
    '',
    JSON.stringify(modelContext),
  ].join('\n');
  if (prompt.length > maxPromptChars) {
    throw new MdoPlanningRuntimeError(
      'planning_context_too_large',
      `MDO planning context is ${prompt.length} characters, exceeding the configured ${maxPromptChars} character limit`
    );
  }
  return prompt;
}

function parseEvidenceMetadata(
  evidenceId: string,
  metadata: unknown,
  checksum: string | null
): MdoInferenceEvidence {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new MdoPlanningRuntimeError('malformed_evidence', 'MDO inference evidence metadata is missing');
  }
  const record = metadata as Record<string, unknown>;
  if (record.schema_version !== 'comind.mdo-002.inference-evidence.v1') {
    throw new MdoPlanningRuntimeError('malformed_evidence', 'MDO inference evidence schema is unsupported');
  }
  const outputText = typeof record.output_text === 'string' ? record.output_text : '';
  if (!outputText || createHash('sha256').update(outputText).digest('hex') !== checksum) {
    throw new MdoPlanningRuntimeError('malformed_evidence', 'MDO inference evidence output checksum does not match');
  }
  return Object.freeze({
    evidenceId,
    taskId: requiredCode(record.task_id, 'evidence.task_id'),
    planId: requiredCode(record.plan_id, 'evidence.plan_id'),
    roleCode: requiredCode(record.role_code, 'evidence.role_code'),
    deliverableType: requiredCode(record.deliverable_type, 'evidence.deliverable_type'),
    providerAdapter: requiredCode(record.provider_adapter, 'evidence.provider_adapter'),
    provider: requiredCode(record.provider, 'evidence.provider'),
    model: requiredCode(record.model, 'evidence.model'),
    upstreamResultRef: typeof record.upstream_result_ref === 'string' ? record.upstream_result_ref : null,
    promptChecksum: requiredCode(record.prompt_checksum, 'evidence.prompt_checksum'),
    outputText,
  });
}

export async function loadMdoInferenceEvidence(
  queryFn: QueryFunction,
  resultRef: string | null
): Promise<MdoInferenceEvidence> {
  const match = typeof resultRef === 'string' ? EVIDENCE_URI.exec(resultRef) : null;
  if (!match) {
    throw new MdoPlanningRuntimeError(
      'evidence_reference_missing',
      'Successful MDO execution did not return a canonical evidence reference'
    );
  }
  const result = await queryFn<EvidenceRow>(
    `SELECT evidence_id::text, metadata, checksum
     FROM comind.cm_evidence
     WHERE evidence_id = $1::uuid
       AND source_type = 'mdo_provider_output'`,
    [match[1]]
  );
  if (result.rows.length !== 1) {
    throw new MdoPlanningRuntimeError(
      'evidence_reference_missing',
      'MDO inference evidence did not resolve exactly once'
    );
  }
  const row = result.rows[0];
  return parseEvidenceMetadata(row.evidence_id, row.metadata, row.checksum);
}

async function persistInferenceEvidence(
  queryFn: QueryFunction,
  request: FoundryAdapterRequest,
  context: MdoTaskContext,
  selection: MdoInferenceSelection,
  prompt: string,
  providerResult: FoundryAdapterResult,
  maxOutputChars: number
): Promise<string> {
  const outputText = providerResult.summary.trim();
  if (!outputText || outputText.length > maxOutputChars) {
    throw new MdoPlanningRuntimeError(
      'invalid_provider_output',
      'MDO provider output is empty or exceeds the configured evidence bound'
    );
  }
  const sourceRef = `foundry-adapter-operation:${request.adapterOperationId}`;
  const existing = await queryFn<EvidenceRow>(
    `SELECT evidence_id::text, metadata, checksum
     FROM comind.cm_evidence
     WHERE source_type = 'mdo_provider_output'
       AND source_ref = $1::text
     ORDER BY created_at, evidence_id
     LIMIT 2`,
    [sourceRef]
  );
  if (existing.rows.length > 1) {
    throw new MdoPlanningRuntimeError(
      'duplicate_provider_evidence',
      'MDO provider operation resolved multiple evidence records'
    );
  }
  if (existing.rows.length === 1) {
    const parsed = parseEvidenceMetadata(
      existing.rows[0].evidence_id,
      existing.rows[0].metadata,
      existing.rows[0].checksum
    );
    if (parsed.taskId !== context.taskId || parsed.planId !== context.planId) {
      throw new MdoPlanningRuntimeError(
        'provider_evidence_conflict',
        'Existing MDO provider evidence belongs to another task or plan'
      );
    }
    return parsed.evidenceId;
  }

  const checksum = createHash('sha256').update(outputText).digest('hex');
  const promptChecksum = createHash('sha256').update(prompt).digest('hex');
  const metadata = {
    schema_version: 'comind.mdo-002.inference-evidence.v1',
    issue: 316,
    task_id: context.taskId,
    plan_id: context.planId,
    module_id: context.moduleId,
    role_code: context.roleCode,
    deliverable_type: context.deliverableType,
    sequence_no: context.sequenceNo,
    provider_adapter: selection.adapter,
    provider: selection.provider,
    model: selection.model,
    upstream_result_ref: providerResult.resultRef ?? null,
    provider_request_fingerprint: sha256Fingerprint({
      adapter: selection.adapter,
      provider: selection.provider,
      model: selection.model,
      prompt_checksum: promptChecksum,
      task_id: context.taskId,
      plan_id: context.planId,
    }),
    prompt_checksum: promptChecksum,
    output_text: outputText,
  };
  const inserted = await queryFn<{ evidence_id: string }>(
    `INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
     VALUES ($1::text, 'mdo_provider_output', $2::text, $3::text, $4::jsonb)
     RETURNING evidence_id::text`,
    [
      `MDO ${context.roleCode} provider output for ${context.moduleName}`,
      sourceRef,
      checksum,
      JSON.stringify(metadata),
    ]
  );
  if (inserted.rows.length !== 1) {
    throw new MdoPlanningRuntimeError(
      'evidence_persistence_failed',
      'MDO provider evidence was not persisted exactly once'
    );
  }
  return inserted.rows[0].evidence_id;
}

export function createMdoFoundryAdapter(options: MdoFoundryAdapterOptions): FoundryAdapter {
  const maxPromptChars = boundedInteger(
    options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS,
    'maxPromptChars',
    1_000,
    64_000
  );
  const maxOutputChars = boundedInteger(
    options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    'maxOutputChars',
    256,
    128_000
  );
  const mdo = options.mdo ?? new GovernedMdoOrchestrator(options.queryFn);

  return async (request: FoundryAdapterRequest): Promise<FoundryAdapterResult> => {
    if (!MDO_CAPABILITIES.has(request.capabilityCode) || request.authorityLevel !== 'C1') {
      throw new MdoPlanningRuntimeError(
        'unsupported_capability',
        'MDO adapter accepts only bounded C1 planning capabilities'
      );
    }
    if (request.targetKind !== 'module_plan' || request.targetRef === null) {
      throw new MdoPlanningRuntimeError('target_mismatch', 'MDO adapter requires one exact module_plan target');
    }
    if (Object.keys(request.input).length !== 0) {
      throw new MdoPlanningRuntimeError(
        'runtime_override_rejected',
        'MDO adapter does not accept prompt, provider, model, or target overrides'
      );
    }

    const execution = await options.queryFn<MdoRuntimeProfileRow>(
      `SELECT ec.profile_id::text, ec.task_id::text, ec.project_id::text, p.runtime_defaults
       FROM comind.cm_foundry_execution_context ec
       JOIN comind.cm_foundry_agent_profile p ON p.profile_id = ec.profile_id
       WHERE ec.execution_context_id = $1::uuid`,
      [request.executionContextId]
    );
    const executionRow = execution.rows.length === 1 ? execution.rows[0] : undefined;
    if (!executionRow?.task_id || !executionRow.project_id) {
      throw new MdoPlanningRuntimeError(
        'execution_context_mismatch',
        'MDO execution context did not resolve one profile, project, and task'
      );
    }
    const context = await mdo.loadTaskContext(executionRow.task_id);
    if (
      context.planId !== request.targetRef
      || context.projectId !== executionRow.project_id
      || context.requiredCapabilityCode !== request.capabilityCode
    ) {
      throw new MdoPlanningRuntimeError(
        'execution_context_mismatch',
        'MDO execution context does not match the exact plan, project, task, and capability'
      );
    }

    const selection = parseInferenceSelection(executionRow.runtime_defaults);
    const prompt = buildMdoPlanningPrompt(context, maxPromptChars);
    const providerAdapter = options.inferenceRegistry.resolve(selection.adapter);
    const providerRequestFingerprint = sha256Fingerprint({
      outer_request_fingerprint: request.requestFingerprint,
      adapter: selection.adapter,
      provider: selection.provider,
      model: selection.model,
      prompt_checksum: createHash('sha256').update(prompt).digest('hex'),
    });
    const providerResult = await providerAdapter({
      executionContextId: request.executionContextId,
      adapterOperationId: request.adapterOperationId,
      capabilityCode: request.capabilityCode,
      action: 'infer',
      authorityLevel: request.authorityLevel,
      targetKind: request.targetKind,
      targetRef: request.targetRef,
      requestFingerprint: providerRequestFingerprint,
      input: Object.freeze({ prompt }),
    });

    if (providerResult.status !== 'succeeded') {
      return {
        status: providerResult.status,
        resultRef: providerResult.resultRef ?? null,
        errorCode: providerResult.errorCode ?? 'mdo_inference_failed',
        summary: `MDO ${context.roleCode} inference via ${selection.provider}/${selection.model} ended ${providerResult.status}.`,
      };
    }
    if (
      selection.adapter === 'ollama_local'
      && !providerResult.resultRef?.startsWith(`ollama-local://${selection.model}/`)
    ) {
      throw new MdoPlanningRuntimeError(
        'provider_provenance_mismatch',
        'Local Ollama result did not confirm the configured model identity'
      );
    }

    const evidenceId = await persistInferenceEvidence(
      options.queryFn,
      request,
      context,
      selection,
      prompt,
      providerResult,
      maxOutputChars
    );
    return {
      status: 'succeeded',
      resultRef: `comind-evidence://${evidenceId}`,
      summary: `MDO ${context.roleCode} planning output recorded as governed evidence via ${selection.provider}/${selection.model}.`,
    };
  };
}

function errorIdentity(error: unknown): string {
  if (error instanceof MdoPlanningRuntimeError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && SAFE_CODE.test(code)) return code;
  }
  if (error instanceof Error && SAFE_CODE.test(error.name)) return error.name;
  return 'unknown_error';
}

async function finishLease(
  queryFn: QueryFunction,
  claim: MdoClaimedWork,
  workerInstanceId: string,
  complete: boolean
): Promise<string> {
  const finished = await queryFn<{ ok: boolean }>(
    `SELECT comind.cm_foundry_finish_work(
       $1::uuid, $2::text, $3::uuid, $4::bigint, $5::boolean
     ) AS ok`,
    [claim.taskId, workerInstanceId, claim.leaseToken, claim.fencingEpoch, complete]
  );
  if (finished.rows.length !== 1 || finished.rows[0].ok !== true) {
    const diagnostic = await queryFn<LeaseDiagnosticRow>(
      `SELECT state,
              worker_instance_id = $2::text AS worker_matches,
              lease_token = $3::uuid AS token_matches,
              fencing_epoch,
              fencing_epoch = $4::bigint AS epoch_matches,
              lease_expires_at::text,
              CASE WHEN lease_expires_at IS NULL THEN NULL
                   ELSE lease_expires_at <= clock_timestamp() END AS expired,
              attempt_count,
              max_attempts
       FROM comind.cm_foundry_work_lease
       WHERE task_id = $1::uuid`,
      [claim.taskId, workerInstanceId, claim.leaseToken, claim.fencingEpoch]
    );
    const row = diagnostic.rows.length === 1 ? diagnostic.rows[0] : null;
    const detail = row
      ? `state=${row.state};worker_match=${row.worker_matches};token_match=${row.token_matches};epoch=${row.fencing_epoch};epoch_match=${row.epoch_matches};expired=${row.expired};attempt=${row.attempt_count}/${row.max_attempts}`
      : 'lease_row=missing_or_ambiguous';
    throw new MdoPlanningRuntimeError(
      'fence_rejected',
      `MDO lease completion was rejected by the fencing contract (${detail})`
    );
  }

  const readback = await queryFn<{ lease_state: string }>(
    `SELECT state AS lease_state
     FROM comind.cm_foundry_work_lease
     WHERE task_id = $1::uuid`,
    [claim.taskId]
  );
  if (readback.rows.length !== 1 || typeof readback.rows[0].lease_state !== 'string') {
    throw new MdoPlanningRuntimeError(
      'lease_readback_failed',
      'MDO lease state could not be read after fenced completion'
    );
  }
  return readback.rows[0].lease_state;
}

async function releaseAfterExecutionFailure(
  queryFn: QueryFunction,
  claim: MdoClaimedWork,
  workerInstanceId: string,
  originalError: unknown
): Promise<string> {
  try {
    return await finishLease(queryFn, claim, workerInstanceId, false);
  } catch (releaseError) {
    const releaseDetail = releaseError instanceof MdoPlanningRuntimeError
      ? `${releaseError.code}:${releaseError.message}`
      : errorIdentity(releaseError);
    throw new MdoPlanningRuntimeError(
      'execution_release_failed',
      `MDO execution failed as ${errorIdentity(originalError)} and retry release failed as ${releaseDetail}`
    );
  }
}

export class MdoPlanningWorker {
  private readonly mdo: Pick<MdoOrchestrator, 'loadTaskContext' | 'submitContribution'>;

  constructor(private readonly options: MdoPlanningWorkerOptions) {
    this.mdo = options.mdo ?? new GovernedMdoOrchestrator(options.queryFn);
  }

  async executeClaim(input: MdoExecuteClaimInput): Promise<MdoExecuteClaimResult> {
    if (!SAFE_CODE.test(input.workerInstanceId) || !input.idempotencyKey.trim()) {
      throw new MdoPlanningRuntimeError(
        'invalid_worker_request',
        'MDO worker identity and idempotency key are required'
      );
    }
    const context = await this.mdo.loadTaskContext(input.claim.taskId);
    if (
      context.planId !== input.claim.planId
      || context.requiredCapabilityCode !== input.claim.capabilityCode
    ) {
      throw new MdoPlanningRuntimeError(
        'claim_context_mismatch',
        'MDO claim does not match its canonical task context'
      );
    }

    let execution: FoundryExecutionResult;
    try {
      execution = await this.options.foundryRuntime.execute({
        profileId: input.profileId,
        capabilityCode: input.claim.capabilityCode,
        authorizationDecisionId: input.authorizationDecisionId,
        authorityLevel: 'C1',
        environment: 'isolated',
        targetKind: 'module_plan',
        targetRef: input.claim.planId,
        projectId: context.projectId,
        taskId: input.claim.taskId,
        idempotencyKey: input.idempotencyKey,
        input: Object.freeze({}),
      });
    } catch (error) {
      await releaseAfterExecutionFailure(
        this.options.queryFn,
        input.claim,
        input.workerInstanceId,
        error
      );
      throw error;
    }

    if (execution.terminalStatus !== 'succeeded') {
      const leaseState = await finishLease(
        this.options.queryFn,
        input.claim,
        input.workerInstanceId,
        false
      );
      if (leaseState === 'exhausted') {
        await this.options.queryFn(
          `UPDATE comind.cm_task SET status = 'blocked' WHERE task_id = $1::uuid AND status <> 'done'`,
          [input.claim.taskId]
        );
      }
      throw new MdoPlanningRuntimeError(
        'planning_execution_failed',
        `MDO planning execution ended ${execution.terminalStatus}`
      );
    }

    const evidence = await loadMdoInferenceEvidence(this.options.queryFn, execution.resultRef);
    if (evidence.taskId !== input.claim.taskId || evidence.planId !== input.claim.planId) {
      await finishLease(this.options.queryFn, input.claim, input.workerInstanceId, false);
      throw new MdoPlanningRuntimeError(
        'evidence_context_mismatch',
        'MDO provider evidence does not match the claimed task and plan'
      );
    }

    const contributionId = await this.mdo.submitContribution({
      taskId: input.claim.taskId,
      profileId: input.profileId,
      executionContextId: execution.executionContextId,
      payload: Object.freeze({
        schema_version: 'comind.mdo-002.plan-contribution.v1',
        role_code: evidence.roleCode,
        deliverable_type: evidence.deliverableType,
        narrative: evidence.outputText,
        provider_provenance: {
          adapter: evidence.providerAdapter,
          provider: evidence.provider,
          model: evidence.model,
          upstream_result_ref: evidence.upstreamResultRef,
          prompt_checksum: evidence.promptChecksum,
        },
      }),
      idempotencyKey: `${input.idempotencyKey}:contribution`,
      evidenceIds: [evidence.evidenceId],
    });

    const leaseState = await finishLease(
      this.options.queryFn,
      input.claim,
      input.workerInstanceId,
      true
    );
    if (leaseState !== 'completed') {
      throw new MdoPlanningRuntimeError(
        'terminal_state_mismatch',
        'Successful MDO contribution did not complete its work lease'
      );
    }
    await this.options.queryFn(
      `UPDATE comind.cm_task SET status = 'done' WHERE task_id = $1::uuid AND status <> 'done'`,
      [input.claim.taskId]
    );

    return Object.freeze({
      taskId: input.claim.taskId,
      planId: input.claim.planId,
      contributionId,
      evidenceId: evidence.evidenceId,
      execution,
      provider: evidence.provider,
      model: evidence.model,
    });
  }
}
