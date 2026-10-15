import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import Fastify from 'fastify';
import { z } from 'zod';
import { canonicalJson, sha256 } from './canonical.mjs';
import { createPool, withTransaction } from './db.mjs';

const UUID = z.string().uuid();
const ProvenanceSchema = z.object({ relation: z.string().min(1).max(80), sourceProducerId: UUID, sourceEventId: UUID });
const EventSchema = z.object({
  eventId: UUID, producerId: UUID.optional(), schemaVersion: z.string().min(1).max(40).default('1.0.0'),
  eventType: z.string().min(1).max(160), sourceTimestamp: z.string().datetime({ offset: true }),
  sequenceNumber: z.number().int().nonnegative().optional(), correlationId: UUID.optional(), causationEventId: UUID.optional(),
  lifecycleHint: z.enum(['A','B','C','D','E']).optional(), sourceEnvironment: z.string().min(1).max(80).default('sdn-001-isolated'),
  traceId: z.string().max(160).optional(), payload: z.unknown(), provenance: z.array(ProvenanceSchema).max(32).default([]),
});
const BatchSchema = z.object({ events: z.array(EventSchema).min(1).max(250) });
const digestToken = (token) => createHash('sha256').update(token).digest();

export function buildApp(options = {}) {
  const pool = options.pool ?? createPool();
  const producerId = options.producerId ?? process.env.SDN_TEST_PRODUCER_ID;
  const producerToken = options.producerToken ?? process.env.SDN_TEST_PRODUCER_TOKEN;
  if (!producerId || !producerToken) throw new Error('SDN test producer identity and token are required');
  const expectedTokenDigest = digestToken(producerToken);
  const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
  app.addHook('onClose', async () => pool.end());

  function authenticate(request, reply) {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { reply.code(401).send({ error: 'authentication_required' }); return false; }
    const supplied = digestToken(auth.slice(7));
    if (supplied.length !== expectedTokenDigest.length || !timingSafeEqual(supplied, expectedTokenDigest)) {
      reply.code(401).send({ error: 'authentication_failed' }); return false;
    }
    return true;
  }

  async function incrementCounter(client, name) {
    await client.query(`INSERT INTO sdn_ops.ingest_counters(counter_name,counter_value,updated_at)
      VALUES ($1,1,clock_timestamp()) ON CONFLICT (counter_name) DO UPDATE
      SET counter_value=sdn_ops.ingest_counters.counter_value+1,updated_at=EXCLUDED.updated_at`, [name]);
  }

  async function persistEvent(input) {
    if (input.producerId && input.producerId !== producerId) return { status: 403, body: { error: 'producer_identity_mismatch' } };
    const payloadCanonical = canonicalJson(input.payload);
    const payloadHash = sha256(payloadCanonical);
    return withTransaction(pool, async (client) => {
      const classification = await client.query(`SELECT event_type,lifecycle_class,sensitivity_class FROM sdn_core.event_type_registry WHERE event_type=$1 AND active=true`, [input.eventType]);
      if (classification.rowCount !== 1) { await incrementCounter(client,'rejected_unknown_type'); return { status: 422, body: { error: 'unregistered_event_type' } }; }
      const { lifecycle_class: lifecycleClass, sensitivity_class: sensitivityClass } = classification.rows[0];
      const policy = await client.query(`SELECT pv.policy_version_id,r.delete_allowed FROM sdn_lifecycle.retention_policy_versions pv
        JOIN sdn_lifecycle.retention_rules r ON r.policy_version_id=pv.policy_version_id
        WHERE pv.status='active' AND r.lifecycle_class=$1 ORDER BY pv.effective_at DESC LIMIT 1`, [lifecycleClass]);
      if (policy.rowCount !== 1) { await incrementCounter(client,'rejected_missing_policy'); return { status: 422, body: { error: 'missing_active_retention_policy', lifecycleClass } }; }
      const existing = await client.query(`SELECT e.event_pk,e.payload_hash,e.lifecycle_class,e.policy_version_id,r.receipt_id,r.ingested_at
        FROM sdn_telemetry.events e JOIN sdn_telemetry.ingestion_receipts r ON r.event_pk=e.event_pk
        WHERE e.producer_id=$1 AND e.event_id=$2`, [producerId,input.eventId]);
      if (existing.rowCount === 1) {
        const row = existing.rows[0];
        if (row.payload_hash === payloadHash) {
          await incrementCounter(client,'duplicates');
          return { status: 200, body: { disposition:'duplicate',receiptId:row.receipt_id,eventPk:row.event_pk,lifecycleClass:row.lifecycle_class,policyVersionId:row.policy_version_id,payloadHash,ingestedAt:row.ingested_at } };
        }
        const conflictId = randomUUID();
        await client.query(`INSERT INTO sdn_evidence.integrity_conflicts(conflict_id,producer_id,event_id,original_event_pk,original_payload_hash,conflicting_payload_hash,conflicting_payload,detected_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,clock_timestamp())`, [conflictId,producerId,input.eventId,row.event_pk,row.payload_hash,payloadHash,payloadCanonical]);
        await incrementCounter(client,'conflicts');
        return { status:409, body:{ error:'event_identity_payload_conflict',conflictId,originalEventPk:row.event_pk } };
      }
      const eventPk=randomUUID(), receiptId=randomUUID();
      const ingested = await client.query(`INSERT INTO sdn_telemetry.events(event_pk,producer_id,event_id,schema_version,event_type,lifecycle_class,sensitivity_class,source_timestamp,sequence_number,correlation_id,causation_event_id,source_environment,trace_id,payload,payload_hash,canonicalization_version,policy_version_id,producer_lifecycle_hint,ingested_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11,$12,$13,$14::jsonb,$15,'json-key-sort-v1',$16,$17,clock_timestamp()) RETURNING ingested_at`,
        [eventPk,producerId,input.eventId,input.schemaVersion,input.eventType,lifecycleClass,sensitivityClass,input.sourceTimestamp,input.sequenceNumber??null,input.correlationId??null,input.causationEventId??null,input.sourceEnvironment,input.traceId??null,payloadCanonical,payloadHash,policy.rows[0].policy_version_id,input.lifecycleHint??null]);
      const ingestedAt=ingested.rows[0].ingested_at;
      await client.query(`INSERT INTO sdn_telemetry.ingestion_receipts(receipt_id,event_pk,producer_id,event_id,payload_hash,lifecycle_class,policy_version_id,ingested_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [receiptId,eventPk,producerId,input.eventId,payloadHash,lifecycleClass,policy.rows[0].policy_version_id,ingestedAt]);
      for (const edge of input.provenance) await client.query(`INSERT INTO sdn_evidence.provenance_edges(provenance_edge_id,subject_event_pk,subject_producer_id,subject_event_id,relation,source_producer_id,source_event_id,recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`, [randomUUID(),eventPk,producerId,input.eventId,edge.relation,edge.sourceProducerId,edge.sourceEventId]);
      await client.query(`INSERT INTO sdn_lifecycle.transition_ledger(transition_id,event_pk,producer_id,event_id,transition_type,policy_version_id,details,recorded_at) VALUES ($1,$2,$3,$4,'ingested',$5,$6::jsonb,clock_timestamp())`, [randomUUID(),eventPk,producerId,input.eventId,policy.rows[0].policy_version_id,canonicalJson({authoritativeClass:lifecycleClass,producerHint:input.lifecycleHint??null})]);
      await incrementCounter(client,'accepted');
      return { status:201, body:{ disposition:'accepted',receiptId,eventPk,producerId,eventId:input.eventId,lifecycleClass,sensitivityClass,policyVersionId:policy.rows[0].policy_version_id,payloadHash,ingestedAt } };
    });
  }

  app.get('/health/live', async()=>({status:'live'}));
  app.get('/health/ready', async(_req,reply)=>{ try { await pool.query('SELECT 1'); return {status:'ready'}; } catch(error){ reply.code(503); return {status:'not_ready',error:error instanceof Error?error.message:String(error)}; } });
  app.get('/health/metrics', async(_req,reply)=>{ try {
    const [counters,lifecycle,size,capacity]=await Promise.all([
      pool.query('SELECT counter_name,counter_value FROM sdn_ops.ingest_counters ORDER BY counter_name'),
      pool.query('SELECT outcome,count(*)::bigint AS count FROM sdn_lifecycle.evaluations GROUP BY outcome ORDER BY outcome'),
      pool.query('SELECT pg_database_size(current_database())::bigint AS database_bytes'),
      pool.query('SELECT database_bytes,free_disk_bytes,sampled_at FROM sdn_ops.capacity_samples ORDER BY sampled_at DESC LIMIT 1')]);
    const fs=await statfs('/'); return { ingestion:Object.fromEntries(counters.rows.map(r=>[r.counter_name,Number(r.counter_value)])), lifecycle:Object.fromEntries(lifecycle.rows.map(r=>[r.outcome,Number(r.count)])), databaseBytes:Number(size.rows[0].database_bytes), latestDatabaseCapacity:capacity.rows[0]??null, serviceFilesystemFreeBytes:Number(fs.bavail)*Number(fs.bsize) };
  } catch(error){ reply.code(503); return {error:error instanceof Error?error.message:String(error)}; } });
  app.post('/v1/events', async(request,reply)=>{ if(!authenticate(request,reply)) return; const parsed=EventSchema.safeParse(request.body); if(!parsed.success) return reply.code(400).send({error:'invalid_event',issues:parsed.error.issues}); const result=await persistEvent(parsed.data); return reply.code(result.status).send(result.body); });
  app.post('/v1/events/batch', async(request,reply)=>{ if(!authenticate(request,reply)) return; const parsed=BatchSchema.safeParse(request.body); if(!parsed.success) return reply.code(400).send({error:'invalid_batch',issues:parsed.error.issues}); const results=[]; for(const event of parsed.data.events){ const result=await persistEvent(event); results.push({eventId:event.eventId,status:result.status,...result.body}); } return reply.code(207).send({results}); });
  return app;
}
