import { QueryFunction } from './db.js';

export interface MdoModuleMaturityInput {
  readonly moduleId: string;
  readonly planId: string;
  readonly actorId: string;
  readonly authorizationDecisionId: string;
  readonly targetStage: 'specified';
  readonly rationale: string;
  readonly sourceRef: string;
  readonly idempotencyKey: string;
  readonly evidenceIds: readonly string[];
}

export interface MdoModuleMaturityResult {
  readonly lifecycleEventId: string;
  readonly created: boolean;
  readonly fromStage: string;
  readonly toStage: string;
}

interface MaturityRow {
  lifecycle_event_id: string;
  created: boolean;
  from_stage: string;
  to_stage: string;
}

export class MdoModuleMaturityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MdoModuleMaturityError';
  }
}

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MdoModuleMaturityError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function requiredEvidence(evidenceIds: readonly string[]): readonly string[] {
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new MdoModuleMaturityError('invalid_request', 'evidenceIds must contain at least one canonical evidence id');
  }
  const values = evidenceIds.map((value, index) => requiredText(value, `evidenceIds[${index}]`));
  return Object.freeze([...new Set(values)].sort());
}

export class MdoModuleMaturityService {
  constructor(private readonly queryFn: QueryFunction) {}

  async transition(input: MdoModuleMaturityInput): Promise<MdoModuleMaturityResult> {
    requiredText(input.moduleId, 'moduleId');
    requiredText(input.planId, 'planId');
    requiredText(input.actorId, 'actorId');
    requiredText(input.authorizationDecisionId, 'authorizationDecisionId');
    requiredText(input.rationale, 'rationale');
    requiredText(input.sourceRef, 'sourceRef');
    requiredText(input.idempotencyKey, 'idempotencyKey');

    if (input.targetStage !== 'specified') {
      throw new MdoModuleMaturityError('invalid_request', 'MDO-005 only supports targetStage specified');
    }

    const evidenceIds = requiredEvidence(input.evidenceIds);
    const result = await this.queryFn<MaturityRow>(
      `SELECT lifecycle_event_id::text, created, from_stage, to_stage
       FROM comind.cm_mdo_transition_module_maturity(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid,
         $5::text, $6::text, $7::text, $8::text, $9::uuid[]
       )`,
      [
        input.moduleId,
        input.planId,
        input.actorId,
        input.authorizationDecisionId,
        input.targetStage,
        input.rationale,
        input.sourceRef,
        input.idempotencyKey,
        [...evidenceIds],
      ]
    );

    if (result.rows.length !== 1) {
      throw new MdoModuleMaturityError(
        'transition_failed',
        'MDO maturity transition did not return exactly one governed result'
      );
    }

    const row = result.rows[0];
    return Object.freeze({
      lifecycleEventId: row.lifecycle_event_id,
      created: row.created,
      fromStage: row.from_stage,
      toStage: row.to_stage,
    });
  }
}
