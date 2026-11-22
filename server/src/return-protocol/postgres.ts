import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { originSchema, returnSchema, type RegisteredOrigin, type ReturnEnvelope,
  type ReturnRecord, type ReturnState, type ReturnStore } from './core.js';

type Row = { envelope: unknown; state: ReturnState; attempt_count: number;
  provider_item_id: string | null; receipt_digest: string | null; last_reason: string | null };

function record(row: Row): ReturnRecord {
  return { envelope: returnSchema.parse(row.envelope), state: row.state,
    attemptCount: row.attempt_count, providerItemId: row.provider_item_id,
    receiptDigest: row.receipt_digest, lastReason: row.last_reason };
}

function sameOrigin(left: RegisteredOrigin, right: RegisteredOrigin): boolean {
  return (Object.keys(right) as Array<keyof RegisteredOrigin>)
    .every(key => left[key] === right[key]);
}

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export class PostgresReturnStore implements ReturnStore {
  constructor(private readonly pool: Pool) {}

  async registerOrigin(origin: RegisteredOrigin): Promise<void> {
    const valid = originSchema.parse(origin);
    await transaction(this.pool, async client => {
      const inserted = await client.query(
        `INSERT INTO comind.cm_aed_crp_origin(origin_id, owner_binding, origin)
         VALUES ($1,$2,$3::jsonb) ON CONFLICT (origin_id) DO NOTHING`,
        [valid.originId, valid.ownerBinding, JSON.stringify(valid)]);
      if (!inserted.rowCount) {
        const prior = await client.query(
          'SELECT origin, revoked_at FROM comind.cm_aed_crp_origin WHERE origin_id=$1 FOR UPDATE', [valid.originId]);
        if (prior.rows[0]?.revoked_at ||
            !sameOrigin(originSchema.parse(prior.rows[0]?.origin), valid)) {
          throw new Error('origin_registration_conflict');
        }
      }
    });
  }

  async resolveOrigin(originId: string): Promise<RegisteredOrigin | null> {
    const found = await this.pool.query(
      'SELECT origin FROM comind.cm_aed_crp_origin WHERE origin_id=$1 AND revoked_at IS NULL', [originId]);
    return found.rows[0] ? originSchema.parse(found.rows[0].origin) : null;
  }

  async stage(input: ReturnEnvelope): Promise<ReturnRecord> {
    const envelope = returnSchema.parse(input);
    return transaction(this.pool, async client => {
      const origin = await client.query(
        'SELECT origin FROM comind.cm_aed_crp_origin WHERE origin_id=$1 AND revoked_at IS NULL FOR UPDATE',
        [envelope.origin.originId]);
      if (!origin.rows[0] || !sameOrigin(originSchema.parse(origin.rows[0].origin), envelope.origin)) {
        throw new Error('unregistered_origin');
      }
      await client.query(
        `INSERT INTO comind.cm_aed_crp_return
          (return_id,logical_key,origin_id,owner_binding,envelope)
         VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (logical_key) DO NOTHING`,
        [envelope.returnId, envelope.logicalKey, envelope.origin.originId,
          envelope.origin.ownerBinding, JSON.stringify(envelope)]);
      const result = await client.query(
        'SELECT * FROM comind.cm_aed_crp_return WHERE logical_key=$1 FOR UPDATE', [envelope.logicalKey]);
      if (!result.rows[0]) throw new Error('stage_failed');
      const existing = record(result.rows[0] as Row);
      if (existing.envelope.adapter !== envelope.adapter ||
          (envelope.adapter === 'openai_api' &&
            existing.envelope.destinationRef !== envelope.destinationRef) ||
          existing.envelope.authorizationRef !== envelope.authorizationRef ||
          existing.envelope.contextDigest !== envelope.contextDigest ||
          existing.envelope.resultDigest !== envelope.resultDigest) {
        throw new Error('logical_delivery_conflict');
      }
      if (existing.envelope.returnId === envelope.returnId) {
        await client.query(
          `INSERT INTO comind.cm_aed_crp_event(return_id,event_type,state,attempt_count)
           SELECT $1,'staged','QUEUED',0 WHERE NOT EXISTS
             (SELECT 1 FROM comind.cm_aed_crp_event WHERE return_id=$1 AND event_type='staged')`,
          [envelope.returnId]);
      }
      return existing;
    });
  }

  async get(returnId: string): Promise<ReturnRecord | null> {
    const result = await this.pool.query('SELECT * FROM comind.cm_aed_crp_return WHERE return_id=$1', [returnId]);
    return result.rows[0] ? record(result.rows[0] as Row) : null;
  }

  async claim(returnId: string, workerId: string): Promise<{
    record: ReturnRecord; fromState: ReturnState; claimToken: string } | null> {
    if (!workerId.trim() || workerId.length > 128) throw new Error('invalid_worker');
    return transaction(this.pool, async client => {
      const selected = await client.query(
        'SELECT * FROM comind.cm_aed_crp_return WHERE return_id=$1 FOR UPDATE', [returnId]);
      const row = selected.rows[0] as (Row & { claim_expires_at: Date | null }) | undefined;
      if (!row || row.attempt_count >= 5) return null;
      const stale = row.state === 'DISPATCHING' && row.claim_expires_at &&
        row.claim_expires_at.getTime() <= Date.now();
      if (!['QUEUED','RETRY_PENDING','DELIVERY_UNCERTAIN'].includes(row.state) && !stale) return null;
      const fromState: ReturnState = stale ? 'DELIVERY_UNCERTAIN' : row.state;
      const token = randomUUID();
      const updated = await client.query(
        `UPDATE comind.cm_aed_crp_return SET state='DISPATCHING',
          worker_id=$2,claim_token=$3,claim_expires_at=clock_timestamp()+interval '90 seconds',
          attempt_count=attempt_count+1,updated_at=clock_timestamp()
         WHERE return_id=$1 RETURNING *`, [returnId, workerId, token]);
      await client.query(
        `INSERT INTO comind.cm_aed_crp_event(return_id,event_type,state,attempt_count,evidence)
         VALUES ($1,'claimed','DISPATCHING',$2,$3::jsonb)`,
        [returnId, updated.rows[0].attempt_count, JSON.stringify({ fromState })]);
      return { record: record(updated.rows[0] as Row), fromState, claimToken: token };
    });
  }

  async transition(returnId: string, workerId: string, claimToken: string, state: ReturnState,
    evidence: { itemId?: string; receiptDigest?: string; reason?: string }): Promise<ReturnRecord> {
    if (!['RECEIPT_VERIFIED','DELIVERY_UNCERTAIN','AUTHORIZATION_REJECTED',
      'DESTINATION_UNAVAILABLE','DEAD_LETTERED','RETRY_PENDING'].includes(state)) {
      throw new Error('invalid_dispatch_transition');
    }
    return transaction(this.pool, async client => {
      const updated = await client.query(
        `UPDATE comind.cm_aed_crp_return SET state=$4,provider_item_id=COALESCE($5,provider_item_id),
          receipt_digest=COALESCE($6,receipt_digest),last_reason=$7,
          worker_id=NULL,claim_token=NULL,claim_expires_at=NULL,updated_at=clock_timestamp()
         WHERE return_id=$1 AND worker_id=$2 AND claim_token=$3 AND state='DISPATCHING'
           AND claim_expires_at > clock_timestamp() RETURNING *`,
        [returnId, workerId, claimToken, state, evidence.itemId ?? null,
          evidence.receiptDigest ?? null, evidence.reason ?? null]);
      if (!updated.rows[0]) throw new Error('claim_lost');
      const result = record(updated.rows[0] as Row);
      await client.query(
        `INSERT INTO comind.cm_aed_crp_event(return_id,event_type,state,attempt_count,evidence)
         VALUES ($1,'transition',$2,$3,$4::jsonb)`,
        [returnId, state, result.attemptCount, JSON.stringify(evidence)]);
      return result;
    });
  }

  async readFallback(returnId: string, ownerBinding: string): Promise<ReturnRecord> {
    const result = await this.pool.query(
      `SELECT r.* FROM comind.cm_aed_crp_return r
       JOIN comind.cm_aed_crp_origin o ON o.origin_id=r.origin_id
       WHERE r.return_id=$1 AND r.owner_binding=$2 AND o.owner_binding=$2
         AND o.revoked_at IS NULL AND r.envelope->>'adapter'='comind_fallback'`,
      [returnId, ownerBinding]);
    if (!result.rows[0]) throw new Error('return_not_available');
    return record(result.rows[0] as Row);
  }

  async acknowledgeFallback(returnId: string, ownerBinding: string, resultDigest: string): Promise<ReturnRecord> {
    return transaction(this.pool, async client => {
      const selected = await client.query(
        `SELECT r.* FROM comind.cm_aed_crp_return r
         JOIN comind.cm_aed_crp_origin o ON o.origin_id=r.origin_id
         WHERE r.return_id=$1 AND r.owner_binding=$2 AND o.owner_binding=$2
           AND o.revoked_at IS NULL AND r.envelope->>'adapter'='comind_fallback'
         FOR UPDATE OF r`, [returnId, ownerBinding]);
      if (!selected.rows[0]) throw new Error('return_not_available');
      const prior = record(selected.rows[0] as Row);
      if (prior.envelope.resultDigest !== resultDigest) throw new Error('digest_mismatch');
      if (prior.state === 'ACKNOWLEDGED') return prior;
      if (prior.state !== 'QUEUED') throw new Error('return_not_acknowledgeable');
      const updated = await client.query(
        `UPDATE comind.cm_aed_crp_return SET state='ACKNOWLEDGED',
           receipt_digest=$2,updated_at=clock_timestamp()
         WHERE return_id=$1 RETURNING *`, [returnId, resultDigest]);
      await client.query(
        `INSERT INTO comind.cm_aed_crp_event(return_id,event_type,state,attempt_count,evidence)
         VALUES ($1,'recipient_acknowledged','ACKNOWLEDGED',$2,$3::jsonb)`,
        [returnId, prior.attemptCount, JSON.stringify({ resultDigest, ownerBinding })]);
      return record(updated.rows[0] as Row);
    });
  }
}
