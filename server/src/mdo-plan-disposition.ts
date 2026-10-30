import { QueryFunction } from './db.js';

export type MdoPlanDisposition = 'accept' | 'block' | 'resume_review' | 'supersede';

export interface MdoPlanDispositionInput {
  readonly planId: string;
  readonly disposition: MdoPlanDisposition;
  readonly actorId: string;
  readonly authorizationDecisionId: string;
  readonly rationale: string;
  readonly sourceRef: string;
  readonly idempotencyKey: string;
  readonly evidenceIds: readonly string[];
  readonly successorPlanId?: string | null;
}

export interface MdoPlanDispositionResult {
  readonly dispositionEventId: string;
  readonly created: boolean;
  readonly fromStatus: string;
  readonly toStatus: string;
}

interface DispositionRow {
  disposition_event_id: string;
  created: boolean;
  from_status: string;
  to_status: string;
}

export class MdoPlanDispositionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'MdoPlanDispositionError';
  }
}

function requiredText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MdoPlanDispositionError('invalid_request', `${field} must be a non-empty string`);
  }
  return value;
}

function requiredEvidence(evidenceIds: readonly string[]): readonly string[] {
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new MdoPlanDispositionError('invalid_request', 'evidenceIds must contain at least one canonical evidence id');
  }
  const values = evidenceIds.map((value, index) => requiredText(value, `evidenceIds[${index}]`));
  return Object.freeze([...new Set(values)].sort());
}

export class MdoPlanDispositionService {
  constructor(private readonly queryFn: QueryFunction) {}

  async dispose(input: MdoPlanDispositionInput): Promise<MdoPlanDispositionResult> {
    requiredText(input.planId, 'planId');
    requiredText(input.actorId, 'actorId');
    requiredText(input.authorizationDecisionId, 'authorizationDecisionId');
    requiredText(input.rationale, 'rationale');
    requiredText(input.sourceRef, 'sourceRef');
    requiredText(input.idempotencyKey, 'idempotencyKey');

    if (!['accept', 'block', 'resume_review', 'supersede'].includes(input.disposition)) {
      throw new MdoPlanDispositionError('invalid_request', 'disposition is not supported');
    }
    if (input.disposition === 'supersede' && !input.successorPlanId) {
      throw new MdoPlanDispositionError('invalid_request', 'supersede requires successorPlanId');
    }
    if (input.disposition !== 'supersede' && input.successorPlanId) {
      throw new MdoPlanDispositionError('invalid_request', 'successorPlanId is only valid for supersede');
    }

    const evidenceIds = requiredEvidence(input.evidenceIds);
    const result = await this.queryFn<DispositionRow>(
      `SELECT disposition_event_id::text, created, from_status, to_status
       FROM comind.cm_mdo_dispose_plan(
         $1::uuid, $2::text, $3::uuid, $4::uuid,
         $5::text, $6::text, $7::uuid, $8::text, $9::uuid[]
       )`,
      [
        input.planId,
        input.disposition,
        input.actorId,
        input.authorizationDecisionId,
        input.rationale,
        input.sourceRef,
        input.successorPlanId ?? null,
        input.idempotencyKey,
        [...evidenceIds],
      ]
    );

    if (result.rows.length !== 1) {
      throw new MdoPlanDispositionError(
        'disposition_failed',
        'MDO disposition did not return exactly one governed result'
      );
    }

    const row = result.rows[0];
    return Object.freeze({
      dispositionEventId: row.disposition_event_id,
      created: row.created,
      fromStatus: row.from_status,
      toStatus: row.to_status,
    });
  }
}
